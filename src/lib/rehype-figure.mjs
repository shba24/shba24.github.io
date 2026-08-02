/**
 * rehype-figure: give images and PlantUML diagrams a rich caption from the
 * italic line written right after them.
 *
 * Authoring convention (one rule):
 *   ![alt](/img.png)
 *   *caption with `code`, **bold**, [links](…)*
 *
 * The italic line is already rendered to `<em>…</em>` (with nested `<code>`,
 * `<a>`, `<strong>`) by the time we run, so moving its children into a
 * `<figcaption>` preserves all formatting — nothing is flattened.
 *
 * - A paragraph containing image(s) becomes one `<figure class="fig-image">`
 *   per image, each paired with its following `<em>` (skipping `<br>`/space).
 * - A `<figure class="diagram">` (from remark-plantuml) followed by an
 *   emphasis-only paragraph gets that `<em>`'s content as its `<figcaption>`.
 */

const isEl = (n, tag) => n && n.type === 'element' && n.tagName === tag;
const isWs = (n) => n && n.type === 'text' && !n.value.trim();
const isImg = (n) => isEl(n, 'img');
const isEm = (n) => isEl(n, 'em');
const hasClass = (n, cls) => Array.isArray(n?.properties?.className) && n.properties.className.includes(cls);

const figcaption = (children) => ({ type: 'element', tagName: 'figcaption', properties: {}, children });
const figure = (classes, children) => ({
  type: 'element',
  tagName: 'figure',
  properties: { className: classes },
  children,
});

// Optional size, authored via the image title: ![alt](/img.png "small"|"medium"|"large").
// Default (no keyword) = natural width capped at the post column.
const SIZES = new Set(['small', 'medium', 'large']);
function popSize(img) {
  const t = (img.properties?.title || '').trim().toLowerCase();
  if (SIZES.has(t)) {
    delete img.properties.title;
    return `fig-${t}`;
  }
  return null;
}

// Minimal inline hast -> HTML (text, code, em, strong, a…) for injecting a
// caption into the raw <figure class="diagram"> string. No deps.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inlineHtml(nodes) {
  return (nodes || [])
    .map((n) => {
      if (n.type === 'text') return esc(n.value);
      if (n.type === 'element') {
        const href = n.tagName === 'a' && n.properties?.href ? ` href="${esc(n.properties.href)}"` : '';
        return `<${n.tagName}${href}>${inlineHtml(n.children)}</${n.tagName}>`;
      }
      return '';
    })
    .join('');
}

// Split a paragraph that holds image(s) into a sequence of <figure> nodes,
// pairing each image with a following <em> caption. Any non-image content is
// grouped back into a single trailing/leading paragraph (not fragmented).
function imagesToFigures(p) {
  const kids = p.children || [];
  const out = [];
  let stray = [];
  const flush = () => {
    if (stray.some((n) => !isWs(n) && !isEl(n, 'br'))) {
      out.push({ type: 'element', tagName: 'p', properties: {}, children: stray });
    }
    stray = [];
  };
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (isImg(node)) {
      flush();
      const size = popSize(node);
      let j = i + 1;
      while (j < kids.length && (isEl(kids[j], 'br') || isWs(kids[j]))) j++;
      const children = [node];
      if (j < kids.length && isEm(kids[j])) {
        children.push(figcaption(kids[j].children));
        i = j;
      }
      const classes = ['fig', 'fig-image'];
      if (size) classes.push(size);
      out.push(figure(classes, children));
    } else {
      stray.push(node);
    }
  }
  flush();
  return out;
}

// A paragraph whose only meaningful child is a single <em> (the caption line).
function soleEm(p) {
  if (!isEl(p, 'p')) return null;
  const kids = (p.children || []).filter((c) => !isWs(c));
  return kids.length === 1 && isEm(kids[0]) ? kids[0] : null;
}

function walk(node) {
  const kids = node.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];

    // Diagram as a parsed element: figure.diagram + following emphasis -> figcaption.
    if (isEl(child, 'figure') && hasClass(child, 'diagram')) {
      let j = i + 1;
      while (j < kids.length && isWs(kids[j])) j++;
      const em = soleEm(kids[j]);
      if (em) {
        child.children.push(figcaption(em.children));
        kids.splice(j, 1);
      }
    }

    // Diagram as a raw HTML node (the usual case) + following emphasis -> inject figcaption.
    if (child.type === 'raw' && /class="diagram/.test(child.value) && /<\/figure>\s*$/.test(child.value)) {
      let j = i + 1;
      while (j < kids.length && isWs(kids[j])) j++;
      const em = soleEm(kids[j]);
      if (em) {
        child.value = child.value.replace(/<\/figure>\s*$/, `<figcaption>${inlineHtml(em.children)}</figcaption></figure>`);
        kids.splice(j, 1);
      }
    }

    // Paragraph containing image(s) -> figure(s).
    if (isEl(child, 'p') && (child.children || []).some(isImg)) {
      const replacement = imagesToFigures(child);
      kids.splice(i, 1, ...replacement);
      i += replacement.length - 1;
      continue;
    }

    walk(child);
  }
}

export default function rehypeFigure() {
  return (tree) => walk(tree);
}
