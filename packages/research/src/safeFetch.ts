import {
  ALLOW_ALL,
  DISALLOW_ALL,
  UnsafeHostError,
  assertPublicHost,
  defaultLookup,
  parseRobots,
  type Lookup,
  type RobotsRules,
} from "@reforge/core";

export const AGENT_TOKEN = "reforge-research";
export const USER_AGENT = `${AGENT_TOKEN}/0.1 (+https://github.com/dev4-gpt/ContractorOS)`;

/** The fetch was refused: robots.txt, a bad scheme or port, a non-2xx answer, or an unsupported content type. */
export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

export interface SafeFetchOptions {
  fetchImpl?: typeof fetch;
  lookup?: Lookup;
  timeoutMs?: number;
  maxBytes?: number;
  /** Minimum gap between requests to the same host. A robots.txt crawl-delay can raise it. Default 1000. */
  minDelayMs?: number;
  maxRedirects?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  /** True when the body was cut at `maxBytes`. */
  truncated: boolean;
}

const TEXT_TYPES = /^(text\/|application\/xhtml\+xml)/;

async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) {
    const text = await res.text();
    return { text: text.slice(0, maxBytes), truncated: text.length > maxBytes };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      chunks.push(value.slice(0, value.length - (total - maxBytes)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), truncated };
}

/**
 * Fetches public web pages politely: it identifies itself, honors robots.txt (conservative on errors), waits
 * between requests to the same host, refuses non-public addresses on every redirect hop, checks the robots.txt of
 * every site it is sent to before requesting from it, caps size and time, and only reads text content.
 * It never runs scripts and never sends cookies or credentials.
 */
export class PoliteFetcher {
  private readonly robots = new Map<string, RobotsRules>();
  private readonly lastRequest = new Map<string, number>();
  private readonly o: Required<Omit<SafeFetchOptions, "fetchImpl" | "lookup" | "sleep" | "now">> & {
    fetchImpl: typeof fetch; lookup: Lookup; sleep: (ms: number) => Promise<void>; now: () => number;
  };

  constructor(options: SafeFetchOptions = {}) {
    this.o = {
      fetchImpl: options.fetchImpl ?? fetch,
      lookup: options.lookup ?? defaultLookup,
      timeoutMs: options.timeoutMs ?? 10_000,
      maxBytes: options.maxBytes ?? 1_000_000,
      minDelayMs: options.minDelayMs ?? 1000,
      maxRedirects: options.maxRedirects ?? 3,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      now: options.now ?? Date.now,
    };
  }

  /** Scheme, port and credential rules, and the public-address guard. Run before every single request. */
  private async vet(url: URL): Promise<void> {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("only http and https addresses can be fetched");
    if (url.port && !["80", "443"].includes(url.port)) throw new FetchBlockedError("only the standard web ports are allowed");
    if (url.username || url.password) throw new FetchBlockedError("addresses with embedded credentials are refused");
    await assertPublicHost(url.hostname, this.o.lookup);
  }

  private async wait(host: string, crawlDelaySeconds = 0): Promise<void> {
    const gap = Math.min(Math.max(this.o.minDelayMs, crawlDelaySeconds * 1000), 10_000);
    const last = this.lastRequest.get(host);
    if (last !== undefined) {
      const remaining = last + gap - this.o.now();
      if (remaining > 0) await this.o.sleep(remaining);
    }
    this.lastRequest.set(host, this.o.now());
  }

  /** Exactly one request. Redirects are returned to the caller, never followed here. */
  private async hop(url: URL, accept: string, crawlDelay = 0): Promise<Response> {
    await this.vet(url);
    await this.wait(url.hostname.toLowerCase(), crawlDelay);
    return this.o.fetchImpl(url, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(this.o.timeoutMs),
    });
  }

  private async rulesFor(url: URL): Promise<RobotsRules> {
    const key = url.origin;
    const cached = this.robots.get(key);
    if (cached) return cached;
    let rules: RobotsRules;
    try {
      let target = new URL("/robots.txt", url);
      let res = await this.hop(target, "text/plain");
      for (let redirects = 0; res.status >= 300 && res.status < 400 && redirects < this.o.maxRedirects; redirects += 1) {
        const location = res.headers.get("location");
        if (!location) break;
        target = new URL(location, target);
        res = await this.hop(target, "text/plain");
      }
      if (res.status === 404 || res.status === 410) rules = ALLOW_ALL;
      else if (res.status >= 200 && res.status < 300) rules = parseRobots((await readCapped(res, 500_000)).text, AGENT_TOKEN);
      else rules = DISALLOW_ALL;
    } catch (error) {
      if (error instanceof UnsafeHostError) throw error;
      rules = DISALLOW_ALL;
    }
    this.robots.set(key, rules);
    return rules;
  }

  async fetchPage(rawUrl: string): Promise<FetchedPage> {
    let current: URL;
    try {
      current = new URL(rawUrl);
    } catch {
      throw new FetchBlockedError("not a usable web address");
    }
    for (let redirects = 0; redirects <= this.o.maxRedirects; redirects += 1) {
      await this.vet(current);
      // Every site we are about to request from gets its robots.txt checked first, including redirect targets.
      const rules = await this.rulesFor(current);
      if (!rules.allows(current.pathname + current.search)) {
        throw new FetchBlockedError(`robots.txt asks crawlers not to fetch ${current.pathname}`);
      }
      const res = await this.hop(current, "text/html, text/markdown, text/plain", rules.crawlDelay ?? 0);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new FetchBlockedError("a redirect had no destination");
        current = new URL(location, current);
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new FetchBlockedError(`the page answered ${res.status}`);
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!TEXT_TYPES.test(contentType)) throw new FetchBlockedError(`unsupported content type: ${contentType || "none"}`);
      const { text, truncated } = await readCapped(res, this.o.maxBytes);
      return { url: rawUrl, finalUrl: current.href, status: res.status, contentType, body: text, truncated };
    }
    throw new FetchBlockedError("too many redirects");
  }
}
