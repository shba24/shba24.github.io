// Client-side Kroki render for the live preview. Mirrors the build-time plugin
// (src/lib/remark-kroki.mjs): same PlantUML skin + D2 sketch option, so preview ≈ published.
const PLANTUML_SKIN = [
  'skinparam backgroundColor transparent',
  'skinparam monochrome true',
  'skinparam shadowing false',
  'skinparam defaultFontName sans-serif',
].join('\n');

const cache = new Map<string, string>();

export async function krokiSvg(lang: 'plantuml' | 'd2', source: string): Promise<string> {
  const key = `${lang}:${source}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const headers: Record<string, string> = { 'Content-Type': 'text/plain', Accept: 'image/svg+xml' };
  if (lang === 'd2') headers['Kroki-Diagram-Options-sketch'] = 'true';
  const body = lang === 'plantuml' ? `${PLANTUML_SKIN}\n${source}` : source;
  const res = await fetch(`https://kroki.io/${lang}/svg`, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`kroki ${lang} ${res.status}`);
  const svg = await res.text();
  cache.set(key, svg);
  return svg;
}
