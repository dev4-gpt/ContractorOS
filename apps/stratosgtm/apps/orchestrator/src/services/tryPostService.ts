/**
 * Thin client for a self-hosted TryPost instance (github.com/dev4-gpt/trypost,
 * called over HTTP; never linked). Endpoints used, all Bearer-authenticated with
 * a workspace-scoped API token:
 *   GET  {TRYPOST_BASE_URL}/api/social-accounts  -> {data:[{id, platform, display_name, username, is_active, status}]}
 *   POST {TRYPOST_BASE_URL}/api/posts            -> 201 {data:{id, status, ...}}
 *        body {content, platforms:[{social_account_id, content_type}]}. VERIFIED LIVE: create always
 *        stores a DRAFT, even with scheduled_at; a 2xx is only "accepted"
 *   PUT  {TRYPOST_BASE_URL}/api/posts/{id}       body {status:'publishing'} -> publishes now (UpdatePost
 *        sets scheduled_at=now and dispatches PublishPost); only `status` is required
 *   GET  {TRYPOST_BASE_URL}/api/posts/{id}       -> {data:{id, status, platforms:[{platform_url, status, ...}]}}
 *        status in draft|scheduled|publishing|published|partially_published|failed
 * (GET /api/workspace is used by keyTesters.) Resources may or may not be wrapped in
 * `data`; both are accepted. The token and upstream error bodies are never returned
 * or logged: failures surface as a status code or an error class name only.
 */

export interface TryPostAccount {
  id: string;
  platform: string;
  displayName: string;
  username: string;
  active: boolean;
}

export type AccountsResult =
  | { ok: true; accounts: TryPostAccount[] }
  | { ok: false; reason: 'unconfigured' | 'unreachable' | 'invalid_response' }
  | { ok: false; reason: 'rejected'; status: number };

export interface PublishResult {
  attemptedRealCall: boolean;
  succeeded: boolean;
  /** published = TryPost confirmed it; pending = accepted, never confirmed; failed = rejected/failed/not attempted. */
  state: 'published' | 'pending' | 'failed';
  postId?: string;
  postUrl?: string;
  details: string;
}

export interface TryPostOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
  maxPolls?: number;
  pollIntervalMs?: number;
}

const TIMEOUT_MS = 8000;

// Text-only content types. Media-first networks (Instagram, TikTok, ...) need media
// this path does not send, so they are refused rather than posted wrongly.
const CONTENT_TYPES: Record<string, string> = {
  bluesky: 'bluesky_post',
  x: 'x_post',
  linkedin: 'linkedin_post',
  'linkedin-page': 'linkedin_page_post',
  facebook: 'facebook_post',
  threads: 'threads_post',
  mastodon: 'mastodon_post',
  telegram: 'telegram_post'
};

export function contentTypeFor(platform: string): string | null {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, platform) ? CONTENT_TYPES[platform] : null;
}

export function tryPostBaseUrl(): string {
  return (process.env.TRYPOST_BASE_URL || '').trim().replace(/\/+$/, '');
}

/** A link is only ever http(s); anything else (javascript:, data:, garbage) is treated as absent. */
export function safeHttpUrl(u: unknown): string | undefined {
  if (typeof u !== 'string') return undefined;
  try {
    const { protocol } = new URL(u);
    return protocol === 'https:' || protocol === 'http:' ? u : undefined;
  } catch {
    return undefined;
  }
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errTag(err: unknown): string {
  const e = err as { name?: string; cause?: { code?: string } };
  return `${e?.name || 'Error'}${e?.cause?.code ? `:${e.cause.code}` : ''}`;
}

const unwrap = (body: any): any => (body && typeof body === 'object' && body.data && !Array.isArray(body.data) ? body.data : body);

function request(url: string, token: string, f: typeof fetch, init: RequestInit = {}) {
  return f(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
}

export async function listAccounts(token: string, opts: TryPostOptions = {}): Promise<AccountsResult> {
  const base = (opts.baseUrl ?? tryPostBaseUrl()).replace(/\/+$/, '');
  if (!base || !token) return { ok: false, reason: 'unconfigured' };
  try {
    const res = await request(`${base}/api/social-accounts`, token, opts.fetch ?? fetch);
    if (!res.ok) return { ok: false, reason: 'rejected', status: res.status };
    const body: any = await res.json();
    const rows = Array.isArray(body) ? body : body?.data;
    if (!Array.isArray(rows)) return { ok: false, reason: 'invalid_response' };
    return {
      ok: true,
      accounts: rows
        .filter((r: any) => r && typeof r.id !== 'undefined' && typeof r.platform === 'string')
        .map((r: any) => ({
          id: String(r.id),
          platform: r.platform,
          displayName: String(r.display_name ?? ''),
          username: String(r.username ?? ''),
          active: r.is_active !== false
        }))
    };
  } catch (err) {
    console.error('[tryPost] listAccounts failed:', errTag(err));
    return { ok: false, reason: 'unreachable' };
  }
}

export async function publish(
  token: string,
  input: { accountId: string; contentType: string; text: string },
  opts: TryPostOptions = {}
): Promise<PublishResult> {
  const base = (opts.baseUrl ?? tryPostBaseUrl()).replace(/\/+$/, '');
  if (!base) return { attemptedRealCall: false, succeeded: false, state: 'failed', details: 'TryPost is not configured on this server.' };
  if (!token) return { attemptedRealCall: false, succeeded: false, state: 'failed', details: 'No TryPost token saved for this workspace.' };

  const f = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxPolls = opts.maxPolls ?? 8;
  const interval = opts.pollIntervalMs ?? 1500;

  // Step 1: create. TryPost's CreatePost always stores a draft, whatever scheduled_at is sent (verified live).
  let postId: string;
  try {
    const res = await request(`${base}/api/posts`, token, f, {
      method: 'POST',
      body: JSON.stringify({ content: input.text, platforms: [{ social_account_id: input.accountId, content_type: input.contentType }] })
    });
    if (!res.ok) {
      return { attemptedRealCall: true, succeeded: false, state: 'failed', details: `TryPost rejected the post (HTTP ${res.status}).` };
    }
    const created = unwrap(await res.json());
    if (!created?.id) {
      return { attemptedRealCall: true, succeeded: false, state: 'failed', details: 'TryPost accepted the request but returned no post id.' };
    }
    postId = String(created.id);
  } catch (err) {
    console.error('[tryPost] publish failed:', errTag(err));
    return { attemptedRealCall: true, succeeded: false, state: 'failed', details: 'Outcome unknown: TryPost may have created the post; check TryPost before retrying.' };
  }

  // Step 2: publish. PUT status=publishing makes UpdatePost stamp scheduled_at=now and dispatch the publish job.
  try {
    const res = await request(`${base}/api/posts/${encodeURIComponent(postId)}`, token, f, {
      method: 'PUT',
      body: JSON.stringify({ status: 'publishing' })
    });
    if (!res.ok) {
      return { attemptedRealCall: true, succeeded: false, state: 'failed', postId, details: `TryPost saved the post as a draft but rejected publishing it (HTTP ${res.status}).` };
    }
  } catch (err) {
    console.error('[tryPost] publish request failed:', errTag(err));
    return { attemptedRealCall: true, succeeded: false, state: 'failed', postId, details: 'Outcome unknown: the post exists as a draft in TryPost and the publish request may have gone through; check TryPost before retrying.' };
  }

  let lastStatus = 'unknown';
  for (let i = 0; i < maxPolls; i++) {
    try {
      const res = await request(`${base}/api/posts/${encodeURIComponent(postId)}`, token, f);
      if (res.ok) {
        const post = unwrap(await res.json());
        lastStatus = typeof post?.status === 'string' ? post.status : 'unknown';
        if (lastStatus === 'published') {
          const url = Array.isArray(post.platforms) ? post.platforms.map((p: any) => safeHttpUrl(p?.platform_url)).find(Boolean) : undefined;
          return { attemptedRealCall: true, succeeded: true, state: 'published', postId, postUrl: url, details: 'TryPost confirmed the post is published.' };
        }
        if (lastStatus === 'failed' || lastStatus === 'partially_published') {
          return { attemptedRealCall: true, succeeded: false, state: 'failed', postId, details: `TryPost reports the post as ${lastStatus}.` };
        }
      } else {
        lastStatus = `http_${res.status}`;
      }
    } catch (err) {
      console.error('[tryPost] status poll failed:', errTag(err));
      lastStatus = 'unreachable';
    }
    if (i < maxPolls - 1) await sleep(interval);
  }
  return {
    attemptedRealCall: true,
    succeeded: false,
    state: 'pending',
    postId,
    details: `TryPost accepted the post and started publishing it, but it was not confirmed published yet (last status: ${lastStatus}). Check the account or TryPost shortly.`
  };
}
