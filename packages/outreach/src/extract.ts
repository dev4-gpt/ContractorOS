/** Facts a business publishes about itself. Only what is actually on the page; nothing is inferred. */
export interface Extracted {
  name?: string;
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  region?: string;
  zip?: string;
  industry?: string;
}

export interface ExtractResult {
  facts: Extracted;
  /** Human-readable notes about how each value was found, so a reviewer knows what to double-check. */
  notes: string[];
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|nbsp);|&#39;|&#x27;/g, (m) => ENTITIES[m] ?? m).replace(/\s+/g, ' ').trim();
}

const GENERIC_TITLE = /^(home|homepage|welcome|contact( us)?|about( us)?|main|index)$/i;
const GENERIC_TYPES = new Set(['localbusiness', 'organization', 'thing', 'store', 'professionalservice', 'homeandconstructionbusiness']);
const LOCAL_TYPE = /(business|plumber|electrician|contractor|locksmith|dentist|attorney|store|restaurant|repair|salon|service|organization)$/i;

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function jsonLdNodes(html: string): Record<string, any>[] {
  const nodes: Record<string, any>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse((m[1] ?? '').trim());
      const stack = asArray<any>(parsed);
      while (stack.length) {
        const n = stack.pop();
        if (n && typeof n === 'object') {
          nodes.push(n);
          if (n['@graph']) stack.push(...asArray<any>(n['@graph']));
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return nodes;
}

function humanizeType(t: string): string {
  return t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function cap(v: string | undefined, max: number): string | undefined {
  if (!v) return undefined;
  const t = decode(v);
  return t && t.length <= max ? t : undefined;
}

export function extractFromHtml(html: string): ExtractResult {
  const facts: Extracted = {};
  const notes: string[] = [];

  const business = jsonLdNodes(html).find((n) => asArray<string>(n['@type']).some((t) => LOCAL_TYPE.test(String(t))));
  if (business) {
    facts.name = cap(business.name, 120);
    facts.phone = cap(business.telephone, 40);
    facts.email = cap(business.email, 200)?.replace(/^mailto:/i, '');
    const type = asArray<string>(business['@type']).map(String).find((t) => !GENERIC_TYPES.has(t.toLowerCase()));
    if (type) facts.industry = cap(humanizeType(type), 80);
    const addr = business.address;
    if (addr && typeof addr === 'object') {
      facts.street = cap(addr.streetAddress, 160);
      facts.city = cap(addr.addressLocality, 80);
      facts.region = cap(addr.addressRegion, 60);
      facts.zip = cap(addr.postalCode, 20);
    }
    notes.push('Structured data (JSON-LD) found on the page.');
  }

  if (!facts.name) {
    const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
    const fromOg = cap(og?.[1], 120);
    if (fromOg) {
      facts.name = fromOg;
      notes.push('Name taken from the og:site_name tag. Check it.');
    }
  }

  if (!facts.name) {
    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    const parts = title.split(/\s+[|\-–—·]\s+/).map((p) => p.trim()).filter((p) => p && !GENERIC_TITLE.test(p));
    const fromTitle = cap(parts[0], 120);
    if (fromTitle) {
      facts.name = fromTitle;
      notes.push('Name guessed from the page title. Verify it before using it.');
    }
  }

  if (!facts.phone) {
    const tel = html.match(/href=["']tel:([^"']+)["']/i)?.[1];
    if (tel) {
      const v = decodeURIComponent(tel).trim();
      if (/^\+?[0-9 ().-]{7,40}$/.test(v)) facts.phone = v;
    }
  }

  if (!facts.email) {
    const mail = html.match(/href=["']mailto:([^"'?\s]+)/i)?.[1];
    if (mail) {
      const v = decodeURIComponent(mail).trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) facts.email = v;
    }
  }

  for (const k of Object.keys(facts) as (keyof Extracted)[]) if (!facts[k]) delete facts[k];
  return { facts, notes };
}
