# Standard Layout — Design

Date: 2026-08-02
Status: Approved

## Problem

Every page hand-rolls its own `.layout` grid in a scoped `<style>` block — the same
width CSS duplicated across 11 files. Two consequences:

1. **Drift / "always dealing with widths".** Any width change means editing many files;
   values fall out of sync (e.g. posts-index used a `1340` shell and `240` rail while the
   rest used `1240`/`200`).
2. **Content position shifts between pages.** Post pages are 3-column
   (`rail + content + toc`) and center the group, landing content near viewport-center.
   List pages (about/posts/references/tags/series/index) are 2-column (`rail + content`),
   so centering pushes content ~120px to the right. Navigating post → list visibly jumps
   the rail and content.

Goal: **one standard layout primitive** every page shares, so content never shifts and
width is defined in exactly one place. Never tune per-page widths again.

## The standard

### Tokens (single source of truth) — already in `:root` of `global.css`
```
--shell:1440px;  --rail:200px;  --toc:210px;  --content:840px;  --gap:44px;
```
Changing width = editing one token. Nothing per-page.

### One shared `.shell` grid (in `global.css`)
Replaces all 11 inline `.layout` blocks. Applied identically by every page.
```
.shell{
  max-width:var(--shell); margin:0 auto; padding:32px 32px 60px;
  display:grid; grid-template-columns:var(--rail) minmax(0,var(--content)) var(--toc);
  gap:var(--gap); justify-content:center;
}
```
- **Three columns on every page.** A CSS grid keeps the 3rd track even with no item in it,
  so list pages (rail + content only) still reserve the `--toc` column → content + rail sit
  in the exact same x-position as on post pages. **Zero shift.** (Decision: "reserve the
  right column everywhere".)
- Column 1 = left rail, column 2 = content (`<main>`), column 3 = TOC when present, else empty.

### Responsive (defined once in `.shell`, not per page)
- `@media(max-width:1080px)`: `grid-template-columns:var(--rail) minmax(0,1fr)` and hide the
  TOC (`:global(.toc){display:none}`) → 2-column.
- `@media(max-width:820px)`: `grid-template-columns:minmax(0,1fr)`, tighten padding, hide the
  rail (`:global(.rail){display:none}`) → 1-column.

### Migration
- Post layout, topbar, and all page `.layout` blocks reference the shared `.shell` (rename
  class `layout` → `shell`, delete the duplicated inline rules).
- `PostLayout`'s `.no-toc` special case is **removed**: with the 3rd track always reserved, a
  post without a TOC simply leaves it empty and content stays in the same x-position as every
  other page (no more 2-column right-shift). The `showToc` flag still controls whether the
  `<TreeToc>` element renders; it no longer changes the grid.
- posts-index normalized to the standard `--rail` (200) and `--gap` (44) — no special cases.

## Topbar nav

Move primary nav out of the left rail into the topbar:
```
Shubham Bansal    About  Posts  References  …………  [search] [theme]
```
- Links sit right after the brand; ~15px, medium weight, `--muted` → `--text` on hover;
  current page rendered at full strength (`aria-current="page"`).
- **Removed** from `LeftRail` (no duplication). Rail keeps Latest / Recommended / Archive /
  socials.
- Mobile: the rail is hidden `<820px`, so primary nav did not exist on mobile before — now it
  lives in the always-visible topbar. Links stay in the bar with compact gaps at narrow widths.

## Global footer

Added once in `BaseLayout` after the content slot, so it appears on every page.
- Text: `© <current year> Shubham Bansal`
- Centered, `--muted`, small, thin top border (`--border-soft`), inner width aligned to
  `--shell`. Year computed at build time.

## Anchor offset

`html{ scroll-padding-top:70px }` in `global.css`. Topbar measured at 55px; 70px gives
breathing room. Fixes TOC clicks and in-page `#anchor` jumps landing under the sticky topbar.
One declaration, global — no JS.

## Affected files

- `src/styles/global.css` — add `.shell` grid + responsive; add `scroll-padding-top`.
- `src/components/Topbar.astro` — add nav links.
- `src/components/LeftRail.astro` — remove nav block.
- `src/layouts/BaseLayout.astro` — add footer.
- `src/layouts/PostLayout.astro` — use `.shell`.
- `src/pages/{index,about,posts/index,references/index,references/useful-technical-blogs,
  tags/index,tags/[tag],series/index,series/[series]}.astro` — use `.shell`, drop inline width CSS.

## Verification

- Render post + about + posts + references at 1600 / 1280 / 820px; assert `.rail` and `main`
  have identical `x` across all four at each width.
- Click a deep TOC anchor; assert the target heading top lands below the 55px topbar.
- Confirm footer present on a post and a list page.
- Deploy green on GitHub Pages.

## Out of scope

- Diagrams & Animation feature (separate effort; blocked on PlantUML engine + Motion Canvas
  decisions).
- Visual restyle beyond nav size and footer (colors, fonts, spacing unchanged).
