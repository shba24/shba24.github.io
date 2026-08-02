import type { BytemdPlugin } from 'bytemd';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import math from '@bytemd/plugin-math';
import { remarkAlert } from 'remark-github-blockquote-alert';
import { krokiSvg } from './kroki.ts';

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

// Render ```plantuml / ```d2 fenced blocks as inline SVG in the preview via Kroki.
const krokiPlugin = (): BytemdPlugin => ({
  viewerEffect({ markdownBody }) {
    const nodes = markdownBody.querySelectorAll('pre > code.language-plantuml, pre > code.language-d2');
    nodes.forEach((code) => {
      const pre = code.parentElement as HTMLElement | null;
      if (!pre || pre.dataset.kroki) return;
      pre.dataset.kroki = '1';
      const lang: 'plantuml' | 'd2' = code.classList.contains('language-d2') ? 'd2' : 'plantuml';
      krokiSvg(lang, code.textContent ?? '')
        .then((s) => {
          const fig = document.createElement('figure');
          fig.className = `diagram diagram-${lang}`;
          fig.innerHTML = s;
          pre.replaceWith(fig);
        })
        .catch(() => {
          pre.dataset.kroki = '';
        });
    });
  },
});

/** Full plugin set: preview fidelity (gfm/highlight/math/callouts/kroki) + custom toolbar buttons. */
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
    highlight(),
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
      'PlantUML diagram',
      svg('<rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="4" width="7" height="6" rx="1"/><rect x="8" y="14" width="8" height="6" rx="1"/>'),
      '```plantuml\n@startuml\n\n@enduml\n```',
    ),
    block(
      'D2 diagram',
      svg('<rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="14" width="7" height="6" rx="1"/><path d="M10 7h4a3 3 0 0 1 3 3v4"/>'),
      '```d2\n\n```',
    ),
    image,
  ];
}
