import { testKey, PerUserRateLimiter } from '../services/keyTesters';

function fakeFetch(status: number) {
  return jest.fn(async (_url: string, _init?: RequestInit) => ({ ok: status >= 200 && status < 300, status }) as Response);
}

describe('testKey', () => {
  it('deepseek calls the free models endpoint with the bearer key', async () => {
    const f = fakeFetch(200);
    const result = await testKey('deepseek', { apiKey: 'sk-1' }, f as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(f).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.objectContaining({ headers: { Authorization: 'Bearer sk-1' } }));
  });

  it('assemblyai mints a 60-second token', async () => {
    const f = fakeFetch(200);
    await testKey('assemblyai', { apiKey: 'aai-1' }, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith(
      'https://agents.assemblyai.com/v1/token?expires_in_seconds=60',
      expect.objectContaining({ headers: { Authorization: 'Bearer aai-1' } })
    );
  });

  it('devto uses the api-key header', async () => {
    const f = fakeFetch(200);
    await testKey('devto', { apiKey: 'dev-1' }, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith('https://dev.to/api/users/me', expect.objectContaining({ headers: { 'api-key': 'dev-1' } }));
  });

  it('linkedin calls userinfo with the access token', async () => {
    const f = fakeFetch(200);
    await testKey('linkedin', { accessToken: 'li-1' }, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith('https://api.linkedin.com/v2/userinfo', expect.objectContaining({ headers: { Authorization: 'Bearer li-1' } }));
  });

  it('reports a rejected key without echoing provider details', async () => {
    const result = await testKey('deepseek', { apiKey: 'bad' }, fakeFetch(401) as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, message: 'DeepSeek rejected this key (HTTP 401).' });
  });

  it('reports a network failure', async () => {
    const f = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const result = await testKey('devto', { apiKey: 'x' }, f as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, message: 'Could not reach dev.to. Try again.' });
  });

  describe('trypost', () => {
    const saved = process.env.TRYPOST_BASE_URL;
    afterEach(() => {
      if (saved === undefined) delete process.env.TRYPOST_BASE_URL;
      else process.env.TRYPOST_BASE_URL = saved;
    });

    it('calls GET /api/workspace on the configured base URL with the bearer token', async () => {
      process.env.TRYPOST_BASE_URL = 'https://tp.example.com/';
      const f = fakeFetch(200);
      const result = await testKey('trypost', { apiToken: 'tp-1' }, f as unknown as typeof fetch);
      expect(result.ok).toBe(true);
      expect(f).toHaveBeenCalledWith(
        'https://tp.example.com/api/workspace',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tp-1' }) })
      );
    });

    it('is ok only on 2xx', async () => {
      process.env.TRYPOST_BASE_URL = 'https://tp.example.com';
      const result = await testKey('trypost', { apiToken: 'bad' }, fakeFetch(401) as unknown as typeof fetch);
      expect(result).toEqual({ ok: false, message: 'TryPost rejected this key (HTTP 401).' });
    });

    it('reports unconfigured without any call when TRYPOST_BASE_URL is unset', async () => {
      delete process.env.TRYPOST_BASE_URL;
      const f = fakeFetch(200);
      const result = await testKey('trypost', { apiToken: 'tp-1' }, f as unknown as typeof fetch);
      expect(f).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/not configured/i);
    });
  });

  it('never calls X', async () => {
    const f = fakeFetch(200);
    const result = await testKey(
      'twitter',
      { apiKey: 'a', apiSecret: 'b', accessToken: 'c', accessTokenSecret: 'd' },
      f as unknown as typeof fetch
    );
    expect(f).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: 'X keys are stored but not tested — X charges for API reads.' });
  });
});

describe('PerUserRateLimiter', () => {
  it('allows 10 per user per minute, then blocks, then resets', () => {
    let now = 0;
    const limiter = new PerUserRateLimiter(10, 60_000, () => now);
    for (let i = 0; i < 10; i++) expect(limiter.allow('u1')).toBe(true);
    expect(limiter.allow('u1')).toBe(false);
    expect(limiter.allow('u2')).toBe(true);
    now = 60_001;
    expect(limiter.allow('u1')).toBe(true);
  });
});
