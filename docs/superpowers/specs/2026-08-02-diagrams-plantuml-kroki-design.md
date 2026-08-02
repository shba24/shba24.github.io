# Diagrams-as-code (PlantUML via Kroki) — Design

Date: 2026-08-02
Status: Approved (Phase 1 of the Diagrams & Animation effort)

## Problem / goal

Technical posts need diagrams (sequence, component, state, etc.). Today there is no
diagram support (MDX + expressive-code + KaTeX only). Author a fenced ` ```plantuml `
block → get a themeable inline SVG at build, with **zero client JS**, matching the
monochrome dark/light palette, and builds that don't depend on a live service once a
diagram has been rendered.

Scope: **PlantUML only**, via Kroki HTTP. Written so other Kroki languages (graphviz,
etc.) are a one-line addition later. **Excalidraw** (interactive) and **Motion Canvas**
(animation) are separate future phases, explicitly out of scope here.

## Approach

A **build-time async remark plugin** (`remark-plantuml`) transforms Markdown before
expressive-code sees it:

- Walk the mdast for `code` nodes with `lang === 'plantuml'`.
- Compute `hash = sha256(source + SKIN + KROKI_VERSION)`.
- If `diagram-cache/<hash>.svg` exists → use it. Else POST the (skin-prefixed) source to
  Kroki and write the returned SVG to the cache.
- Replace the `code` node with an mdast `html` node:
  `<figure class="diagram">…inline svg…</figure>`.

Because the node becomes raw HTML at the **remark** stage, expressive-code's later rehype
pass ignores it (it only styles real code blocks) — this resolves the ordering concern.

### Why a small custom plugin (not `remark-kroki`)
Control over (a) monochrome `currentColor` theming, (b) a committed on-disk cache, and (c)
loud build failures — none of which the off-the-shelf plugins do. Noted as the alternative.

## Rendering / Kroki

- `POST ${KROKI_URL}/plantuml/svg` with the diagram source as the body; `Accept: image/svg+xml`.
  POST avoids URL-length limits and base64 encoding.
- `KROKI_URL` env var, default `https://kroki.io`. Lets you self-host later with no code change.
- Build-time only; the SVG is inlined, so nothing hits Kroki at runtime.

## Caching

- Committed dir `diagram-cache/` with `<hash>.svg` files + `manifest.json` (hash → source
  preview, for debuggability). Reuses the audio pipeline's sha256+manifest idea, but the
  SVGs are **committed** (tiny text) so CI needs no network unless a diagram changed.
- New/changed diagram not yet in cache → CI renders it via Kroki once, then it can be
  committed.

## Theming (monochrome dark/light)

1. Prepend a fixed skin to the source before sending:
   ```
   skinparam backgroundColor transparent
   skinparam monochrome true
   skinparam shadowing false
   skinparam defaultFontName sans-serif
   ```
   `monochrome true` → black-on-transparent line art.
2. Post-process the returned SVG: replace black fills/strokes (`#000000`, `black`) and the
   default text color with `currentColor`; drop any opaque background rect.
3. Wrap in `<figure class="diagram">`; CSS `.diagram{color:var(--text)} .diagram svg{max-width:100%;height:auto}`.
   The diagram inherits the theme's text color and adapts automatically on toggle.

Fallback if `currentColor` rewriting proves lossy on a given diagram: it still renders in
neutral line-art on a transparent background (readable on both themes), just not
theme-reactive. Acceptable.

## Error handling

Kroki returns HTTP 400 + a text error for bad syntax. On error with no cached SVG:
**throw** during build with the diagram source + Kroki's message → broken diagrams never ship.

## Integration

- `astro.config.mjs`: add `remarkPlantuml` to `markdown.remarkPlugins` (before the others is
  fine; it only touches `plantuml` code nodes). Astro supports async remark plugins.
- Global CSS: add the `.diagram` rules to `global.css`.
- A real demo diagram added to one existing post to exercise the path end-to-end.

## Verification

- Unit: SVG post-processor (fixture Kroki SVG → `currentColor`, no bg rect); cache-key hashing.
- Integration/e2e: a post with a ` ```plantuml ` block renders an inline `<svg>` inside
  `figure.diagram`, leaves **no** raw `plantuml` code block, and the SVG uses `currentColor`
  (readable at both themes). Build succeeds and the second build is a cache hit (no Kroki call).

## Files

- Create: `src/lib/remark-plantuml.mjs` (plugin), `diagram-cache/` (committed cache), `tests/diagrams.spec.ts`.
- Modify: `astro.config.mjs` (register plugin), `src/styles/global.css` (`.diagram` rules),
  one post `.md` (demo diagram), `.gitignore` (ensure `diagram-cache/` is NOT ignored).

## Out of scope
Excalidraw interactive scenes; Motion Canvas animations; non-PlantUML Kroki languages
(trivially addable later).
