import type { Prospect, Sender } from './types.js';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Picks black or white text for readable contrast on the given six-digit hex background. */
export function readableTextColor(hex: string): '#000000' | '#ffffff' {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = (v ?? 0) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export const DEFAULT_ACCENT = '#2563eb';

function addressLines(p: Prospect): string[] {
  const cityLine = [p.city, [p.region, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [p.street, cityLine].filter((v): v is string => Boolean(v));
}

/**
 * Renders a single static page from facts the business itself made public. It never adds reviews,
 * ratings, hours, prices, awards or claims. Sections that have no supplied facts are left out.
 */
export function renderSite(p: Prospect, sender: Sender): string {
  const accent = p.accentColor ?? DEFAULT_ACCENT;
  const onAccent = readableTextColor(accent);
  const who = sender.business ? `${sender.name} (${sender.business})` : sender.name;
  const tagline = [p.industry, p.city ? `serving ${p.city}` : ''].filter(Boolean).join(' · ');

  const services = p.services?.length
    ? `<section aria-labelledby="services"><h2 id="services">Services</h2><ul>${p.services
        .map((s) => `<li>${esc(s)}</li>`)
        .join('')}</ul></section>`
    : '';

  const contactItems: string[] = [];
  if (p.phone) contactItems.push(`<li>Phone: <a href="tel:${esc(p.phone.replace(/[^+0-9]/g, ''))}">${esc(p.phone)}</a></li>`);
  if (p.email) contactItems.push(`<li>Email: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></li>`);
  const address = addressLines(p);
  if (address.length) contactItems.push(`<li>Address: ${address.map(esc).join(', ')}</li>`);
  const contact = contactItems.length
    ? `<section aria-labelledby="contact"><h2 id="contact">Contact</h2><ul>${contactItems.join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(p.name)} - website concept</title>
<style>
:root{--accent:${accent};--on-accent:${onAccent};--ink:#1a1a1a;--muted:#555;--bg:#fff;--line:#ddd}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
.concept{background:#111;color:#fff;padding:.75rem 1rem;font-size:.9rem}
.concept a{color:#fff}
header.hero{background:var(--accent);color:var(--on-accent);padding:3.5rem 1.25rem}
.wrap{max-width:52rem;margin:0 auto}
h1{margin:0 0 .5rem;font-size:clamp(1.9rem,5vw,2.8rem);line-height:1.15}
.tag{margin:0;font-size:1.1rem}
main{padding:1.5rem 1.25rem 3rem}
section{margin:2rem 0}
h2{font-size:1.3rem;margin:0 0 .75rem}
ul{padding-left:1.2rem;margin:0}
li{margin:.3rem 0}
a{color:var(--ink)}
footer{border-top:1px solid var(--line);padding:1.25rem;font-size:.9rem;color:var(--muted)}
</style>
</head>
<body>
<div class="concept" role="note">Concept preview made by ${esc(who)} for ${esc(p.name)}. This is not ${esc(p.name)}'s official website and it does not collect enquiries. To have it removed, email <a href="mailto:${esc(sender.email)}">${esc(sender.email)}</a>.</div>
<header class="hero"><div class="wrap"><h1>${esc(p.name)}</h1>${tagline ? `<p class="tag">${esc(tagline)}</p>` : ''}</div></header>
<main><div class="wrap">${services}${contact}</div></main>
<footer><div class="wrap">Concept only. Built from details the business has published publicly. Not affiliated with ${esc(p.name)}.</div></footer>
</body>
</html>
`;
}

export function robotsTxt(): string {
  return 'User-agent: *\nDisallow: /\n';
}

export function vercelJson(): string {
  return (
    JSON.stringify(
      { headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }] },
      null,
      2
    ) + '\n'
  );
}
