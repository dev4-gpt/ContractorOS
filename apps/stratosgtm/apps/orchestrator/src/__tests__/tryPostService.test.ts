import { listAccounts, publish, contentTypeFor } from '../services/tryPostService';

const BASE = 'https://tp.example.com';
const TOKEN = 'tp_super_secret_token';

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const noSleep = async () => undefined;
const opts = (fetchImpl: jest.Mock, extra = {}) => ({
  baseUrl: BASE,
  fetch: fetchImpl as unknown as typeof fetch,
  sleep: noSleep,
  maxPolls: 3,
  ...extra
});
const input = { accountId: 'acc-1', contentType: 'bluesky_post', text: 'hello' };

describe('listAccounts', () => {
  it('returns id/platform/name from the {data:[...]} envelope and sends the bearer token', async () => {
    const f = jest.fn(async () =>
      res(200, { data: [{ id: 'a1', platform: 'bluesky', display_name: 'Me', username: 'me.bsky.social', is_active: true, status: 'connected' }] })
    );
    const out = await listAccounts(TOKEN, opts(f));
    expect(out).toEqual({ ok: true, accounts: [{ id: 'a1', platform: 'bluesky', displayName: 'Me', username: 'me.bsky.social', active: true }] });
    expect(f).toHaveBeenCalledWith(`${BASE}/api/social-accounts`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }));
  });

  it('reports unconfigured without calling out', async () => {
    const f = jest.fn();
    const out = await listAccounts(TOKEN, opts(f, { baseUrl: '' }));
    expect(out).toEqual({ ok: false, reason: 'unconfigured' });
    expect(f).not.toHaveBeenCalled();
  });

  it('maps upstream errors and network failures without leaking text', async () => {
    expect(await listAccounts(TOKEN, opts(jest.fn(async () => res(401))))).toEqual({ ok: false, reason: 'rejected', status: 401 });
    const boom = jest.fn(async () => {
      throw Object.assign(new TypeError(`fetch failed for ${TOKEN}`), { cause: { code: 'ECONNREFUSED' } });
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = await listAccounts(TOKEN, opts(boom));
    expect(out).toEqual({ ok: false, reason: 'unreachable' });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    spy.mockRestore();
  });
});

describe('publish', () => {
  it('creates a draft, PUTs status=publishing, then confirms via GET: succeeded only when status is published', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p1', status: 'draft' } }))
      .mockResolvedValueOnce(res(200, { data: { id: 'p1', status: 'publishing' } }))
      .mockResolvedValueOnce(res(200, { data: { id: 'p1', status: 'publishing', platforms: [] } }))
      .mockResolvedValueOnce(res(200, { data: { id: 'p1', status: 'published', platforms: [{ platform_url: 'https://bsky.app/x' }] } }));
    const out = await publish(TOKEN, input, opts(f));
    expect(out).toMatchObject({ attemptedRealCall: true, succeeded: true, state: 'published', postId: 'p1', postUrl: 'https://bsky.app/x' });
    // Step 1: create. TryPost always stores this as a draft (verified live), so no scheduled_at is sent.
    const [createUrl, createInit] = f.mock.calls[0];
    expect(createUrl).toBe(`${BASE}/api/posts`);
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(createInit.body)).toEqual({ content: 'hello', platforms: [{ social_account_id: 'acc-1', content_type: 'bluesky_post' }] });
    // Step 2: publish now. Only `status` is required; UpdatePost dispatches the publish job for 'publishing'.
    const [publishUrl, publishInit] = f.mock.calls[1];
    expect(publishUrl).toBe(`${BASE}/api/posts/p1`);
    expect(publishInit.method).toBe('PUT');
    expect(JSON.parse(publishInit.body)).toEqual({ status: 'publishing' });
    // Step 3: read back.
    expect(f.mock.calls[2][0]).toBe(`${BASE}/api/posts/p1`);
    expect(f.mock.calls[2][1].method).toBeUndefined();
  });

  it('a rejected publish step leaves the draft, is not success and never polls', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p7' } }))
      .mockResolvedValueOnce(res(422, { message: `secret ${TOKEN}` }));
    const out = await publish(TOKEN, input, opts(f));
    expect(out).toMatchObject({ attemptedRealCall: true, succeeded: false, state: 'failed', postId: 'p7' });
    expect(out.details).toMatch(/draft/i);
    expect(out.details).toContain('422');
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('a publish step that throws says the outcome is unknown and never leaks the token', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p8' } }))
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error(`bad ${TOKEN}`), { name: 'TimeoutError' });
      });
    const out = await publish(TOKEN, input, opts(f));
    expect(out).toMatchObject({ attemptedRealCall: true, succeeded: false, state: 'failed', postId: 'p8' });
    expect(out.details).toMatch(/Outcome unknown/);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    expect(f).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('4xx/5xx from POST -> succeeded:false, no throw, no upstream text', async () => {
    for (const status of [422, 500]) {
      const f = jest.fn(async () => res(status, { message: `secret ${TOKEN}` }));
      const out = await publish(TOKEN, input, opts(f));
      expect(out).toMatchObject({ attemptedRealCall: true, succeeded: false, state: 'failed' });
      expect(out.details).toContain(String(status));
      expect(JSON.stringify(out)).not.toContain(TOKEN);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('never reaching published is not success (accepted != published)', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p2', status: 'draft' } }))
      .mockResolvedValue(res(200, { data: { id: 'p2', status: 'draft' } }));
    const out = await publish(TOKEN, input, opts(f));
    expect(out).toMatchObject({ attemptedRealCall: true, succeeded: false, state: 'pending', postId: 'p2' });
    expect(out.details).toMatch(/not confirmed/i);
    expect(f).toHaveBeenCalledTimes(1 + 1 + 3); // create, publish, 3 polls
  });

  it('a failed post surfaces as failed and stops polling', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p3', status: 'scheduled' } }))
      .mockResolvedValue(res(200, { data: { id: 'p3', status: 'failed', platforms: [{ error_message: 'nope' }] } }));
    const out = await publish(TOKEN, input, opts(f));
    expect(out).toMatchObject({ succeeded: false, state: 'failed', postId: 'p3' });
    expect(out.details).not.toContain('nope');
    expect(f).toHaveBeenCalledTimes(3); // create, publish, one poll that reports failed
  });

  it('partially_published is not success', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p4' } }))
      .mockResolvedValue(res(200, { data: { id: 'p4', status: 'partially_published' } }));
    expect((await publish(TOKEN, input, opts(f))).succeeded).toBe(false);
  });

  it('unconfigured base URL attempts nothing', async () => {
    const f = jest.fn();
    const out = await publish(TOKEN, input, opts(f, { baseUrl: '' }));
    expect(out).toMatchObject({ attemptedRealCall: false, succeeded: false, state: 'failed' });
    expect(f).not.toHaveBeenCalled();
  });

  it('missing token attempts nothing', async () => {
    const f = jest.fn();
    const out = await publish('', input, opts(f));
    expect(out).toMatchObject({ attemptedRealCall: false, succeeded: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('network errors never leak the token', async () => {
    const f = jest.fn(async () => {
      throw Object.assign(new Error(`bad ${TOKEN}`), { name: 'FetchError' });
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = await publish(TOKEN, input, opts(f));
    expect(out).toMatchObject({ attemptedRealCall: true, succeeded: false });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    spy.mockRestore();
  });

  it('drops a non-http(s) platform_url', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p5' } }))
      .mockResolvedValue(res(200, { data: { id: 'p5', status: 'published', platforms: [{ platform_url: 'javascript:alert(1)' }] } }));
    const out = await publish(TOKEN, input, opts(f));
    expect(out).toMatchObject({ succeeded: true });
    expect(out.postUrl).toBeUndefined();
  });

  it.each(['draft', 'scheduled', 'publishing'])('poll ending at %s is pending, not success', async (status) => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(res(201, { data: { id: 'p6' } }))
      .mockResolvedValue(res(200, { data: { id: 'p6', status } }));
    expect(await publish(TOKEN, input, opts(f))).toMatchObject({ succeeded: false, state: 'pending' });
  });

  it('a POST network error says the outcome is unknown', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = jest.fn(async () => {
      throw new TypeError('x');
    });
    const out = await publish(TOKEN, input, opts(boom));
    spy.mockRestore();
    expect(out.details).toMatch(/Outcome unknown/);
    expect(out.succeeded).toBe(false);
  });

  it('a 2xx POST with no id is not success', async () => {
    const f = jest.fn(async () => res(201, {}));
    expect(await publish(TOKEN, input, opts(f))).toMatchObject({ succeeded: false, state: 'failed' });
  });
});

describe('contentTypeFor', () => {
  it('maps text-capable platforms and refuses media-only ones', () => {
    expect(contentTypeFor('bluesky')).toBe('bluesky_post');
    expect(contentTypeFor('x')).toBe('x_post');
    expect(contentTypeFor('instagram')).toBeNull();
  });
});
