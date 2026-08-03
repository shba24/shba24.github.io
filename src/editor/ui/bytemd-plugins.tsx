import type { BytemdPlugin } from 'bytemd';
import gfm from '@bytemd/plugin-gfm';
import math from '@bytemd/plugin-math';
import { remarkAlert } from 'remark-github-blockquote-alert';
import { krokiSvg } from './kroki.ts';

// Lazy singleton for Shiki. Dynamically imported so it stays out of the editor's initial
// bundle (and it is dev-only code anyway — the editor is never built for production).
let shikiModule: Promise<typeof import('shiki')> | null = null;
const getShiki = () => (shikiModule ??= import('shiki'));

const svg = (inner: string) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// A toolbar button that appends a markdown block at the cursor.
const block = (title: string, icon: string, text: string): BytemdPlugin => ({
  actions: [
    {
      title,
      icon,
      handler: {
        type: 'action',
        click(ctx) {
          ctx.appendBlock(text);
          ctx.editor.focus();
        },
      },
    },
  ],
});

// GitHub-style callouts in the preview (same remark plugin the site build uses).
const calloutPlugin = (): BytemdPlugin => ({
  remark: (p) => p.use(remarkAlert),
});

// Highlight fenced code with the SAME Shiki engine + `vesper` theme the site's
// astro-expressive-code uses, so preview token colors match the published page. This
// matches colors/background only — not Expressive Code's frame chrome (title bar, copy
// button, line markers), which is a build-time layer that can't run in a client preview.
const LANG_CLASS = /(?:^|\s)language-([\w-]+)/;
const KROKI_LANGS = new Set(['plantuml', 'd2']); // owned by the kroki plugin below
const shikiHighlight = (): BytemdPlugin => ({
  viewerEffect({ markdownBody }) {
    const blocks = markdownBody.querySelectorAll('pre > code[class*="language-"]');
    blocks.forEach((code) => {
      const pre = code.parentElement as HTMLElement | null;
      if (!pre || pre.dataset.shiki) return;
      const lang = LANG_CLASS.exec(code.className)?.[1] ?? 'text';
      if (KROKI_LANGS.has(lang)) return; // let the kroki plugin render these as SVG
      pre.dataset.shiki = '1';
      const source = code.textContent ?? '';
      getShiki()
        .then(({ codeToHtml, bundledLanguages }) =>
          codeToHtml(source, { lang: lang in bundledLanguages ? lang : 'text', theme: 'vesper' }),
        )
        .then((html) => {
          const tpl = document.createElement('template');
          tpl.innerHTML = html.trim();
          const next = tpl.content.firstElementChild; // <pre class="shiki vesper">…</pre>
          if (next) pre.replaceWith(next);
        })
        .catch(() => {
          pre.dataset.shiki = ''; // clear the guard so a later re-render can retry
        });
    });
  },
});

// Render ```plantuml / ```d2 fenced blocks as inline SVG in the preview via Kroki,
// and pair a following italic-only paragraph as the figure caption (site convention).
const krokiPlugin = (): BytemdPlugin => ({
  viewerEffect({ markdownBody }) {
    const nodes = markdownBody.querySelectorAll('pre > code.language-plantuml, pre > code.language-d2');
    nodes.forEach((code) => {
      const pre = code.parentElement as HTMLElement | null;
      if (!pre || pre.dataset.kroki) return;
      pre.dataset.kroki = '1';
      const lang: 'plantuml' | 'd2' = code.classList.contains('language-d2') ? 'd2' : 'plantuml';
      const caption = pre.nextElementSibling; // possible "*caption*" paragraph
      krokiSvg(lang, code.textContent ?? '')
        .then((s) => {
          const fig = document.createElement('figure');
          fig.className = `diagram diagram-${lang}`;
          fig.innerHTML = s;
          pre.replaceWith(fig);
          if (caption && caption.tagName === 'P') {
            const kids = Array.from(caption.childNodes).filter(
              (n) => !(n.nodeType === 3 && !n.textContent?.trim()),
            );
            if (kids.length === 1 && kids[0].nodeName === 'EM') {
              const figcap = document.createElement('figcaption');
              figcap.innerHTML = (kids[0] as HTMLElement).innerHTML;
              fig.appendChild(figcap);
              caption.remove();
            }
          }
        })
        .catch(() => {
          pre.dataset.kroki = '';
        });
    });
  },
});

/** Full plugin set: preview fidelity (gfm/shiki/math/callouts/kroki) + custom toolbar buttons. */
export function buildPlugins({ onImage }: { onImage: () => void }): BytemdPlugin[] {
  const image: BytemdPlugin = {
    actions: [
      {
        title: 'Insert image (alt / size / caption)',
        icon: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
        handler: { type: 'action', click() { onImage(); } },
      },
    ],
  };
  return [
    gfm(),
    shikiHighlight(),
    math(),
    calloutPlugin(),
    krokiPlugin(),
    block('Callout', svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'), '> [!NOTE]\n> '),
    block(
      'Table',
      svg('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
      '| Column | Column |\n| --- | --- |\n| Cell | Cell |\n',
    ),
    block('Code block', svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'), '```\n\n```'),
    block(
      'PlantUML diagram (with caption)',
      svg('<rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="4" width="7" height="6" rx="1"/><rect x="8" y="14" width="8" height="6" rx="1"/>'),
      '```plantuml\n@startuml\n\n@enduml\n```\n*caption*',
    ),
    block(
      'D2 diagram (with caption)',
      svg('<rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="14" width="7" height="6" rx="1"/><path d="M10 7h4a3 3 0 0 1 3 3v4"/>'),
      '```d2\n\n```\n*caption*',
    ),
    image,
  ];
}
