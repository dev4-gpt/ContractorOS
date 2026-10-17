import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { assertPublicUrl, Resolver, UnsafeUrlError } from './ssrf';

export const BUYERLAB_USER_AGENT = 'StratosGTM-BuyerLab/1.0 (+https://stratosgtm.vercel.app)';

export class FetchFailedError extends Error {
  constructor(message: string, public readonly reason: 'timeout' | 'not_html' | 'too_many_redirects' | 'network') {
    super(message);
    this.name = 'FetchFailedError';
  }
}

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
}
export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}
export type Transport = (
  url: URL,
  address: string,
  family: 4 | 6,
  o: { timeoutMs: number; maxBytes: number; userAgent: string }
) => Promise<RawResponse>;

/** One GET, connecting to `address` (the IP the guard validated) instead of resolving the name again. */
export const httpRequestOnce: Transport = (url, address, family, o) =>
  new Promise((resolve, reject) => {
    const lib = (url.protocol === 'https:' ? https : http) as typeof http;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(total);
      fn();
    };
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: 'GET',
        agent: false,
        headers: { 'User-Agent': o.userAgent, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8', 'Accept-Encoding': 'identity' },
        servername: isIP(hostname) ? undefined : hostname,
        lookup: (_host: string, options: any, cb: any) => {
          if (options && options.all) cb(null, [{ address, family }]);
          else cb(null, address, family);
        }
      } as http.RequestOptions,
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const finish = () =>
          settle(() =>
            resolve({
              status: res.statusCode ?? 0,
              headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v ?? '')])),
              body: Buffer.concat(chunks).toString('utf8'),
              truncated
            })
          );
        res.on('data', (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > o.maxBytes) {
            truncated = true;
            chunks.push(c.subarray(0, c.length - (size - o.maxBytes)));
            res.destroy();
            finish();
            return;
          }
          chunks.push(c);
        });
        res.on('end', finish);
        res.on('close', finish);
        res.on('error', () => settle(() => reject(new FetchFailedError('The connection failed.', 'network'))));
      }
    );
    const total = setTimeout(() => {
      req.destroy();
      settle(() => reject(new FetchFailedError('The request timed out.', 'timeout')));
    }, o.timeoutMs);
    req.on('error', () => settle(() => reject(new FetchFailedError('The connection failed.', 'network'))));
    req.end();
  });

export interface SafeFetchOptions {
  /** Content-Type pattern to accept on a 2xx. Default: HTML. */
  accept?: RegExp;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  resolve?: Resolver;
  transport?: Transport;
  /** Absolute deadline (epoch ms). Each hop's timeout becomes min(timeoutMs, deadlineAt - now()). */
  deadlineAt?: number;
  /** Clock function for deadline checks. Default: Date.now. */
  now?: () => number;
}

const DEFAULT_ACCEPT = /^(text\/html|application\/xhtml\+xml)/i;

/**
 * GET with the SSRF guard applied to the start URL AND to every redirect hop, the
 * connection pinned to the validated address, a size cap, a time cap and a content-type
 * check. Non-2xx responses are returned (body dropped) so callers can decide.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 4;
  const transport = opts.transport ?? httpRequestOnce;
  const accept = opts.accept ?? DEFAULT_ACCEPT;
  const now = opts.now ?? (() => Date.now());
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // Check deadline before starting this hop
    if (opts.deadlineAt !== undefined) {
      const remaining = opts.deadlineAt - now();
      if (remaining <= 0) {
        throw new FetchFailedError('The request timed out.', 'timeout');
      }
    }

    // Race assertPublicUrl against the remaining deadline
    let guardResult;
    if (opts.deadlineAt !== undefined) {
      const remaining = opts.deadlineAt - now();
      let timeoutId: any = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new FetchFailedError('The request timed out.', 'timeout'));
        }, Math.max(1, remaining));
      });
      try {
        guardResult = await Promise.race([assertPublicUrl(current, opts.resolve), timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }
    } else {
      guardResult = await assertPublicUrl(current, opts.resolve);
    }
    const { url, address, family } = guardResult;

    const hopTimeout = opts.deadlineAt !== undefined ? Math.max(1, opts.deadlineAt - now()) : opts.timeoutMs ?? 8000;
    const res = await transport(url, address, family, {
      timeoutMs: Math.min(hopTimeout, opts.timeoutMs ?? 8000),
      maxBytes: opts.maxBytes ?? 1_500_000,
      userAgent: BUYERLAB_USER_AGENT
    });

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      try {
        current = new URL(res.headers.location, url).href;
      } catch {
        throw new UnsafeUrlError('The redirect target is not a valid URL.', 'bad_url');
      }
      continue;
    }
    const contentType = res.headers['content-type'] ?? '';
    if (res.status >= 400) return { finalUrl: url.href, status: res.status, contentType, body: '', truncated: false };
    if (!accept.test(contentType)) throw new FetchFailedError('That URL is not an HTML page.', 'not_html');
    return { finalUrl: url.href, status: res.status, contentType, body: res.body, truncated: res.truncated };
  }
  throw new FetchFailedError('Too many redirects.', 'too_many_redirects');
}
