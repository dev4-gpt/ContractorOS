import type { ByokPlatform } from './workspaceKeysService';

export interface KeyTestResult {
  ok: boolean;
  message: string;
}

const TIMEOUT_MS = 8000;

const CHECKS: Record<
  Exclude<ByokPlatform, 'twitter'>,
  { label: string; request: (s: Record<string, string>) => [string, RequestInit] }
> = {
  deepseek: {
    label: 'DeepSeek',
    request: (s) => ['https://api.deepseek.com/models', { headers: { Authorization: `Bearer ${s.apiKey}` } }]
  },
  assemblyai: {
    label: 'AssemblyAI',
    request: (s) => [
      'https://agents.assemblyai.com/v1/token?expires_in_seconds=60',
      { headers: { Authorization: `Bearer ${s.apiKey}` } }
    ]
  },
  devto: {
    label: 'dev.to',
    request: (s) => ['https://dev.to/api/users/me', { headers: { 'api-key': s.apiKey } }]
  },
  linkedin: {
    label: 'LinkedIn',
    request: (s) => ['https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${s.accessToken}` } }]
  },
  trypost: {
    label: 'TryPost',
    // Read-only workspace lookup (GET /api/workspace); the base URL is checked in testKey.
    request: (s) => [
      `${(process.env.TRYPOST_BASE_URL || '').replace(/\/+$/, '')}/api/workspace`,
      { headers: { Authorization: `Bearer ${s.apiToken}`, Accept: 'application/json' } }
    ]
  }
};

/**
 * One free, read-only call per platform to confirm a key works. Provider
 * response bodies are never returned or stored.
 */
export async function testKey(
  platform: ByokPlatform,
  secrets: Record<string, string>,
  fetcher: typeof fetch = fetch
): Promise<KeyTestResult> {
  if (platform === 'twitter') {
    return { ok: false, message: 'X keys are stored but not tested — X charges for API reads.' };
  }
  if (platform === 'trypost' && !process.env.TRYPOST_BASE_URL) {
    return { ok: false, message: 'TryPost is not configured on this server (TRYPOST_BASE_URL unset).' };
  }
  const check = CHECKS[platform];
  const [url, init] = check.request(secrets);
  try {
    const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return { ok: true, message: `${check.label} accepted this key.` };
    return { ok: false, message: `${check.label} rejected this key (HTTP ${res.status}).` };
  } catch {
    return { ok: false, message: `Could not reach ${check.label}. Try again.` };
  }
}

/** Fixed-window limiter, per process. */
export class PerUserRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = 10,
    private readonly windowMs = 60_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  public allow(userId: string): boolean {
    const t = this.now();
    const w = this.windows.get(userId);
    if (!w || t - w.start > this.windowMs) {
      this.windows.set(userId, { start: t, count: 1 });
      return true;
    }
    if (w.count >= this.limit) return false;
    w.count += 1;
    return true;
  }
}
