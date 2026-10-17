import { safeFetch, SafeFetchResult } from './safeFetch';
import { UnsafeUrlError } from './ssrf';
import { extractPage } from './htmlText';
import { parseRobots, isAllowedByRobots, RobotsRule } from './robots';

export interface CrawledPage {
  url: string;
  title: string;
  headings: string[];
  text: string;
  status: number;
}
export interface CrawlResult {
  pages: CrawledPage[];
  skipped: Array<{ url: string; reason: string }>;
  truncated: boolean;
}
export type CrawlFetch = (url: string, o?: { accept?: RegExp; maxBytes?: number; deadlineAt?: number; maxRedirects?: number }) => Promise<SafeFetchResult>;

/** A page with less visible text than this is almost certainly client-rendered or empty. */
export const MIN_PAGE_TEXT_CHARS = 200;
const SKIP_EXT = /\.(pdf|png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|zip|gz|mp4|mp3|woff2?|ttf)(\?|$)/i;

export async function crawl(
  startUrl: string,
  opts: { maxPages?: number; deadlineMs?: number } = {},
  deps: { fetch?: CrawlFetch; now?: () => number } = {}
): Promise<CrawlResult> {
  const fetchPage = deps.fetch ?? ((u, o) => safeFetch(u, o));
  const now = deps.now ?? (() => Date.now());
  const maxPages = opts.maxPages ?? 12;
  const deadlineAt = now() + (opts.deadlineMs ?? 40_000);

  const start = new URL(startUrl);
  let origin = start.origin;
  const pages: CrawledPage[] = [];
  const skipped: Array<{ url: string; reason: string }> = [];
  const queue: string[] = [start.href];
  // Every URL we have queued or landed on (a redirect target counts), so nothing is fetched twice.
  const queued = new Set<string>(queue);
  const processed = new Set<string>(); // Final URLs we've already processed
  let truncated = false;
  // Page-URL fetches only (failures included, robots.txt excluded).
  let fetchAttempts = 0;
  const maxAttempts = maxPages * 3;
  let firstFetchDone = false;

  // Fetch robots.txt for the initial origin
  let rules: RobotsRule[] = [];
  try {
    const r = await fetchPage(`${origin}/robots.txt`, { accept: /^text\//i, maxBytes: 200_000, deadlineAt, maxRedirects: 1 });
    if (r.status === 200) rules = parseRobots(r.body);
  } catch {
    /* no readable robots.txt: allow all */
  }

  // One request at a time, in order: courtesy to the host and deadline enforcement.
  // `truncated` means exactly this: we stopped early with URLs still queued.
  while (queue.length > 0) {
    if (pages.length >= maxPages || fetchAttempts >= maxAttempts || now() >= deadlineAt) {
      truncated = true;
      break;
    }
    const url = queue.shift() as string;
    const urlObj = new URL(url);

    if (!isAllowedByRobots(rules, urlObj.pathname)) {
      skipped.push({ url, reason: 'robots' });
      continue;
    }

    let res: SafeFetchResult;
    const isFirstFetch = !firstFetchDone;
    firstFetchDone = true;
    fetchAttempts++;
    try {
      res = await fetchPage(url, { deadlineAt, maxRedirects: 4 });
    } catch (err) {
      // The start URL failing the SSRF guard is the caller's problem; a bad link is just skipped.
      if (url === start.href && err instanceof UnsafeUrlError) throw err;
      const reason = err instanceof UnsafeUrlError ? err.reason : (err as { reason?: string }).reason ?? 'error';
      skipped.push({ url, reason });
      continue;
    }

    if (res.status >= 400) {
      skipped.push({ url, reason: `http_${res.status}` });
      continue;
    }

    const finalUrl = new URL(res.finalUrl);

    // Only the very first page fetch may move the origin (apex -> www). Any later page that lands elsewhere is skipped.
    if (isFirstFetch && finalUrl.origin !== origin) {
      origin = finalUrl.origin;
      // Fetch robots.txt for the new origin
      try {
        const r = await fetchPage(`${origin}/robots.txt`, { accept: /^text\//i, maxBytes: 200_000, deadlineAt, maxRedirects: 1 });
        if (r.status === 200) rules = parseRobots(r.body);
      } catch {
        /* no readable robots.txt: allow all */
      }
    }

    if (finalUrl.origin !== origin) {
      skipped.push({ url, reason: 'cross_origin_redirect' });
      continue;
    }

    // Check if we've already processed this final URL (deduplication)
    if (processed.has(res.finalUrl)) {
      // We've processed this final URL before, so skip extracting again
      continue;
    }
    processed.add(res.finalUrl);
    queued.add(res.finalUrl);

    // Re-check robots for the final URL's path (in case redirect changed it)
    if (!isAllowedByRobots(rules, finalUrl.pathname)) {
      skipped.push({ url, reason: 'robots' });
      continue;
    }

    let page;
    try {
      page = extractPage(res.body, res.finalUrl);
    } catch {
      skipped.push({ url, reason: 'extract_failed' });
      continue;
    }

    if (page.text.length < MIN_PAGE_TEXT_CHARS) {
      skipped.push({ url, reason: 'thin_content' });
    } else {
      pages.push({ url: res.finalUrl, title: page.title, headings: page.headings, text: page.text, status: res.status });
    }

    for (const link of page.links) {
      if (queued.has(link)) continue;
      queued.add(link);
      let u: URL;
      try {
        u = new URL(link);
      } catch {
        continue;
      }
      // Cross-origin links are never queued (so never fetched), and files are not pages.
      if (u.origin !== origin || SKIP_EXT.test(u.pathname)) continue;
      queue.push(link);
    }
  }
  return { pages, skipped, truncated };
}
