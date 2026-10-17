import { extractFromHtml, type Extracted } from './extract.js';
import { assertPublicHost, defaultLookup, UnsafeHostError, type Lookup } from './netguard.js';
import { ALLOW_ALL, DISALLOW_ALL, parseRobots, type RobotsRules } from './robots.js';
import { ValidationError, validateProspect } from './validate.js';

export const AGENT_TOKEN = 'prospect-previews';
export const USER_AGENT = `${AGENT_TOKEN}/0.1 (+https://github.com/dev4-gpt/ContractorOS)`;

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt asks crawlers not to fetch ${url}. Nothing was fetched.`);
    this.name = 'RobotsDisallowedError';
  }
}

export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  lookup?: Lookup;
  maxPages?: number;
  timeoutMs?: number;
  maxBytes?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Details {
  /** A prospect draft. Always review it: nothing here has been verified by a person. */
  draft: Record<string, unknown>;
  pagesUsed: string[];
  notes: string[];
}

const sameSite = (a: string, b: string) => a.replace(/^www\./, '') === b.replace(/^www\./, '');

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      chunks.push(value.slice(0, value.length - (total - maxBytes)));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Fetches public pages politely: it identifies itself, honors robots.txt, waits between requests, stays on one site,
 * refuses non-public addresses, follows only same-site redirects, caps size and time, and never runs scripts.
 */
export async function fetchPublicDetails(startUrl: string, opts: FetchOptions = {}): Promise<Details> {
  const doFetch = opts.fetchImpl ?? fetch;
  const lookup = opts.lookup ?? defaultLookup;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const maxPages = Math.min(opts.maxPages ?? 3, 5);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const notes: string[] = [];

  let origin: URL;
  try {
    origin = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(startUrl) ? startUrl : `https://${startUrl}`);
  } catch {
    throw new FetchError('That is not a usable web address.');
  }
  if (!/^https?:$/.test(origin.protocol)) throw new FetchError('Only http and https addresses can be fetched.');
  if (origin.port && !['80', '443'].includes(origin.port)) throw new FetchError('Only the standard web ports are allowed.');
  const host = origin.hostname.toLowerCase();

  async function get(url: URL, accept: string): Promise<{ status: number; type: string; body: string; finalUrl: URL }> {
    let current = url;
    for (let hop = 0; hop <= 3; hop++) {
      if (!sameSite(current.hostname.toLowerCase(), host)) throw new FetchError(`Redirected to a different site (${current.hostname}); stopped.`);
      await assertPublicHost(current.hostname, lookup);
      const res = await doFetch(current, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new FetchError('A redirect had no destination.');
        current = new URL(loc, current);
        if (!/^https?:$/.test(current.protocol)) throw new FetchError('A redirect pointed somewhere other than http(s).');
        continue;
      }
      return { status: res.status, type: (res.headers.get('content-type') ?? '').toLowerCase(), body: await readCapped(res, maxBytes), finalUrl: current };
    }
    throw new FetchError('Too many redirects.');
  }

  // 1. robots.txt first. Conservative on errors: if we cannot read it properly, we do not crawl.
  let robots: RobotsRules;
  try {
    const r = await get(new URL('/robots.txt', origin), 'text/plain');
    if (r.status === 404 || r.status === 410) {
      robots = ALLOW_ALL;
      notes.push('No robots.txt found.');
    } else if (r.status >= 200 && r.status < 300) {
      robots = parseRobots(r.body, AGENT_TOKEN);
      notes.push('robots.txt read and followed.');
    } else {
      robots = DISALLOW_ALL;
      notes.push(`robots.txt answered ${r.status}; treated as "do not crawl".`);
    }
  } catch (err) {
    if (err instanceof UnsafeHostError) throw err;
    if (err instanceof FetchError && /different site|redirect/i.test(err.message)) throw err;
    robots = DISALLOW_ALL;
    notes.push('Could not read robots.txt; treated as "do not crawl".');
  }
  if (!robots.allows('/')) throw new RobotsDisallowedError(origin.origin);

  const delay = Math.min(Math.max(opts.delayMs ?? 1000, (robots.crawlDelay ?? 0) * 1000), 10_000);
  const allowed = (u: URL) => robots.allows(u.pathname + u.search);

  const facts: Extracted = {};
  const contributed = new Set<string>();
  const pagesUsed: string[] = [];
  const merge = (page: URL, html: string) => {
    const { facts: f, notes: n } = extractFromHtml(html);
    let used = false;
    for (const [k, v] of Object.entries(f) as [keyof Extracted, string][]) {
      if (!facts[k]) {
        facts[k] = v;
        used = true;
      }
    }
    if (used) contributed.add(page.toString());
    n.forEach((x) => !notes.includes(x) && notes.push(x));
  };

  // 2. The home page, then contact/about pages it links to, up to a small cap.
  const queue: URL[] = [new URL('/', origin)];
  let fetched = 0;
  let linksAdded = false;
  while (queue.length && fetched < maxPages) {
    const page = queue.shift() as URL;
    if (!allowed(page)) {
      notes.push(`robots.txt disallows ${page.pathname}; skipped.`);
      continue;
    }
    if (fetched > 0) await sleep(delay);
    let r;
    try {
      r = await get(page, 'text/html');
    } catch (err) {
      if (err instanceof FetchError || err instanceof Error) notes.push(`Could not fetch ${page.pathname}: ${err.message}`);
      continue;
    }
    fetched++;
    if (r.status < 200 || r.status >= 300 || !r.type.includes('text/html')) {
      notes.push(`${page.pathname} answered ${r.status} (${r.type || 'no content type'}); ignored.`);
      continue;
    }
    pagesUsed.push(page.toString());
    merge(page, r.body);

    if (!linksAdded) {
      linksAdded = true;
      const seen = new Set([page.pathname]);
      const re = /href=["']([^"'#]*(?:contact|about)[^"']*)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(r.body)) && queue.length < 2) {
        try {
          const u = new URL(m[1] as string, page);
          if (sameSite(u.hostname.toLowerCase(), host) && !seen.has(u.pathname) && /^https?:$/.test(u.protocol)) {
            seen.add(u.pathname);
            queue.push(u);
          }
        } catch {
          /* skip unparseable links */
        }
      }
      if (queue.length === 0) queue.push(new URL('/contact', origin));
    }
  }

  const draft: Record<string, unknown> = {
    ...facts,
    website: origin.origin,
    sourceOfDetails: [...contributed].join(' ; ') || origin.origin
  };
  if (!facts.name) notes.push('Could not find the business name. Add it by hand.');
  try {
    validateProspect(draft);
  } catch (err) {
    if (err instanceof ValidationError) err.problems.forEach((p) => notes.push(`Needs fixing: ${p}`));
  }
  notes.push('Everything above came from the pages listed in sourceOfDetails. Review and correct it before running add.');
  return { draft, pagesUsed, notes };
}
