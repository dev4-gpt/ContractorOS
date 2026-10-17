import express, { Request, Response, NextFunction } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createMeRouter } from '../routes/me';
import { WorkspaceKeysService, KeyStore, StoredKey } from '../services/workspaceKeysService';
import { PerUserRateLimiter } from '../services/keyTesters';
import type { PlatformCredentials } from '../services/clientCredentialsService';
import type { AccountsResult, PublishResult } from '../services/tryPostService';

class MemoryKeyStore implements KeyStore {
  rows = new Map<string, StoredKey>();
  async list(t: string) {
    return [...this.rows.entries()].filter(([k]) => k.startsWith(`${t}::`)).map(([, v]) => v);
  }
  async get(t: string, p: string) {
    return this.rows.get(`${t}::${p}`)?.entry ?? null;
  }
  async upsert(t: string, p: string, entry: PlatformCredentials) {
    this.rows.set(`${t}::${p}`, { platform: p, entry, updatedAt: new Date() });
  }
  async remove(t: string, p: string) {
    return this.rows.delete(`${t}::${p}`);
  }
  async replaceIfUnchanged() {
    return false;
  }
}

function fakeRequireUser(req: Request, res: Response, next: NextFunction) {
  const who = req.header('x-test-user');
  if (!who) return res.status(401).json({ code: 'SIGNED_OUT' });
  Object.assign(req, {
    user: { userId: `user-${who}`, email: `${who}@example.com`, name: `User ${who}`, image: null },
    workspace: { tenantId: `tenant-${who}`, role: 'owner' }
  });
  next();
}

const accountsFor = (token: string): AccountsResult => ({
  ok: true,
  accounts: [{ id: `acc-${token.slice(-1)}`, platform: 'bluesky', displayName: 'N', username: `u-${token.slice(-1)}`, active: true }]
});

const listAccounts = jest.fn(async (token: string): Promise<AccountsResult> => accountsFor(token));
const publish = jest.fn(
  async (_token: string, _i: { accountId: string; contentType: string; text: string }): Promise<PublishResult> => ({
    attemptedRealCall: true,
    succeeded: true,
    state: 'published',
    postId: 'p1',
    postUrl: 'https://bsky.app/p1',
    details: 'TryPost confirmed the post is published.'
  })
);

let server: Server;
let base: string;
let store: MemoryKeyStore;
const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.TRYPOST_BASE_URL = 'https://tp.example.com';
  process.env.ENABLE_REAL_PUBLISHING = 'true';
  store = new MemoryKeyStore();
  listAccounts.mockClear();
  publish.mockClear();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/me',
    createMeRouter({
      requireUser: fakeRequireUser,
      keys: new WorkspaceKeysService(store, () => true),
      testKey: jest.fn(),
      limiter: new PerUserRateLimiter(),
      publishLimiter: new PerUserRateLimiter(3, 60_000),
      tryPost: { listAccounts, publish }
    })
  );
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  process.env = { ...savedEnv };
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

const call = (user: string | null, method: string, path: string, body?: unknown) =>
  fetch(`${base}/api/me${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
const json = async (res: Awaited<ReturnType<typeof fetch>>): Promise<any> => res.json();
const connect = (user: string, token: string) => call(user, 'PUT', '/credentials/trypost', { apiToken: token });

describe('GET /api/me/trypost/accounts', () => {
  it('requires sign-in', async () => {
    expect((await call(null, 'GET', '/trypost/accounts')).status).toBe(401);
  });

  it('409 when the tenant has no saved token, and never calls TryPost', async () => {
    const res = await call('a', 'GET', '/trypost/accounts');
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('TRYPOST_NOT_CONNECTED');
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it('503 when TRYPOST_BASE_URL is unset', async () => {
    delete process.env.TRYPOST_BASE_URL;
    await connect('a', 'tok-a');
    const res = await call('a', 'GET', '/trypost/accounts');
    expect(res.status).toBe(503);
    expect((await json(res)).code).toBe('TRYPOST_UNCONFIGURED');
  });

  it("uses only the caller tenant's token", async () => {
    await connect('a', 'tok-a');
    await connect('b', 'tok-b');
    const a = await json(await call('a', 'GET', '/trypost/accounts'));
    expect(a.accounts[0].id).toBe('acc-a');
    const b = await json(await call('b', 'GET', '/trypost/accounts'));
    expect(b.accounts[0].id).toBe('acc-b');
    expect(listAccounts.mock.calls.map((c) => c[0])).toEqual(['tok-a', 'tok-b']);
    expect(JSON.stringify(a)).not.toContain('tok-a');
  });

  it('maps a rejected token to a clean 502 with no upstream text', async () => {
    await connect('a', 'tok-a');
    listAccounts.mockResolvedValueOnce({ ok: false, reason: 'rejected', status: 401 });
    const res = await call('a', 'GET', '/trypost/accounts');
    expect(res.status).toBe(502);
    expect(JSON.stringify(await json(res))).not.toContain('tok-a');
  });
});

describe('POST /api/me/publish', () => {
  const body = { text: 'hello world', accountIds: ['acc-a'] };

  it('requires sign-in', async () => {
    expect((await call(null, 'POST', '/publish', body)).status).toBe(401);
  });

  it('validates input', async () => {
    await connect('a', 'tok-a');
    for (const bad of [
      {},
      { text: '', accountIds: ['x'] },
      { text: '   ', accountIds: ['x'] },
      { text: 'x'.repeat(10001), accountIds: ['x'] },
      { text: 'hi', accountIds: [] },
      { text: 'hi', accountIds: [1] },
      { text: 'hi', accountIds: 'x' },
      { text: 'hi', accountIds: Array.from({ length: 6 }, (_, i) => `a${i}`) }
    ]) {
      expect((await call('a', 'POST', '/publish', bad)).status).toBe(400);
    }
    expect(publish).not.toHaveBeenCalled();
  });

  it('409 with no saved token', async () => {
    const res = await call('a', 'POST', '/publish', body);
    expect(res.status).toBe(409);
    expect(publish).not.toHaveBeenCalled();
  });

  it('503 when TRYPOST_BASE_URL is unset', async () => {
    delete process.env.TRYPOST_BASE_URL;
    await connect('a', 'tok-a');
    expect((await call('a', 'POST', '/publish', body)).status).toBe(503);
    expect(publish).not.toHaveBeenCalled();
  });

  it('real receipt (isSimulated:false) only when TryPost confirmed published', async () => {
    await connect('a', 'tok-a');
    const res = await call('a', 'POST', '/publish', body);
    expect(res.status).toBe(200);
    const { receipts } = await json(res);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ platform: 'trypost', status: 'published', isSimulated: false, postId: 'p1', postUrl: 'https://bsky.app/p1', accountHandle: 'u-a' });
    expect(publish).toHaveBeenCalledWith('tok-a', { accountId: 'acc-a', contentType: 'bluesky_post', text: 'hello world' });
    expect(JSON.stringify(receipts)).not.toContain('tok-a');
  });

  it("tenant isolation: B cannot publish through A's account and never uses A's token", async () => {
    await connect('a', 'tok-a');
    await connect('b', 'tok-b');
    const res = await call('b', 'POST', '/publish', body); // A's account id
    const { receipts } = await json(res);
    expect(receipts[0]).toMatchObject({ status: 'failed', isSimulated: true });
    expect(publish).not.toHaveBeenCalled();
    expect(listAccounts.mock.calls.map((c) => c[0])).toEqual(['tok-b']);
  });

  it('simulated receipt when ENABLE_REAL_PUBLISHING is not true, with no real publish', async () => {
    process.env.ENABLE_REAL_PUBLISHING = 'false';
    await connect('a', 'tok-a');
    const { receipts } = await json(await call('a', 'POST', '/publish', body));
    expect(receipts[0]).toMatchObject({ status: 'simulated_live', isSimulated: true, postId: '' });
    expect(receipts[0].details).toMatch(/simulated/i);
    expect(publish).not.toHaveBeenCalled();
  });

  it('a failed real attempt is failed and simulated:true', async () => {
    await connect('a', 'tok-a');
    publish.mockResolvedValueOnce({ attemptedRealCall: true, succeeded: false, state: 'failed', details: 'TryPost rejected the post (HTTP 422).' });
    const { receipts } = await json(await call('a', 'POST', '/publish', body));
    expect(receipts[0]).toMatchObject({ status: 'failed', isSimulated: true });
    expect(receipts[0].details).toContain('422');
  });

  it('accepted-but-unconfirmed is queued and simulated:true', async () => {
    await connect('a', 'tok-a');
    publish.mockResolvedValueOnce({ attemptedRealCall: true, succeeded: false, state: 'pending', postId: 'p9', details: 'not confirmed published' });
    const { receipts } = await json(await call('a', 'POST', '/publish', body));
    expect(receipts[0]).toMatchObject({ status: 'queued', isSimulated: true, postId: 'p9' });
  });

  it('refuses media-first platforms with a failed receipt', async () => {
    await connect('a', 'tok-a');
    listAccounts.mockResolvedValueOnce({ ok: true, accounts: [{ id: 'ig', platform: 'instagram', displayName: '', username: 'ig', active: true }] });
    const { receipts } = await json(await call('a', 'POST', '/publish', { text: 'hi', accountIds: ['ig'] }));
    expect(receipts[0]).toMatchObject({ status: 'failed', isSimulated: true });
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not burn a rate-limit slot on 409', async () => {
    for (let i = 0; i < 5; i++) expect((await call('a', 'POST', '/publish', body)).status).toBe(409);
    await connect('a', 'tok-a');
    expect((await call('a', 'POST', '/publish', body)).status).toBe(200);
  });

  it('drops a non-http(s) postUrl from receipts', async () => {
    await connect('a', 'tok-a');
    publish.mockResolvedValueOnce({ attemptedRealCall: true, succeeded: true, state: 'published', postId: 'p', postUrl: 'javascript:alert(1)', details: 'ok' });
    const { receipts } = await json(await call('a', 'POST', '/publish', body));
    expect(receipts[0].postUrl).toBe('');
  });

  it('rate limits per user', async () => {
    await connect('a', 'tok-a');
    for (let i = 0; i < 3; i++) await call('a', 'POST', '/publish', body);
    expect((await call('a', 'POST', '/publish', body)).status).toBe(429);
  });
});
