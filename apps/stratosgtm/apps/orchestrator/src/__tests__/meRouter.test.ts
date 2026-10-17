import express, { Request, Response, NextFunction } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createMeRouter } from '../routes/me';
import { WorkspaceKeysService, KeyStore, StoredKey } from '../services/workspaceKeysService';
import { PerUserRateLimiter } from '../services/keyTesters';
import type { PlatformCredentials } from '../services/clientCredentialsService';

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
  async replaceIfUnchanged(t: string, p: string, entry: PlatformCredentials, expectedUpdatedAt: Date) {
    const key = `${t}::${p}`;
    const current = this.rows.get(key);
    if (!current || current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return false;
    await this.upsert(t, p, entry);
    return true;
  }
}

// Stand-in for requireUser: the header names which test user is calling.
function fakeRequireUser(req: Request, res: Response, next: NextFunction) {
  const who = req.header('x-test-user');
  if (!who) return res.status(401).json({ code: 'SIGNED_OUT' });
  Object.assign(req, {
    user: { userId: `user-${who}`, email: `${who}@example.com`, name: `User ${who}`, image: null },
    workspace: { tenantId: `tenant-${who}`, role: 'owner' }
  });
  next();
}

let server: Server;
let base: string;
let store: MemoryKeyStore;
const testKey = jest.fn(async (_platform: string, _secrets: Record<string, string>) => ({
  ok: true,
  message: 'DeepSeek accepted this key.'
}));

function start(storageReady: boolean, limiter: PerUserRateLimiter) {
  const app = express();
  app.use(express.json());
  app.use('/api/me', createMeRouter({ requireUser: fakeRequireUser, keys: new WorkspaceKeysService(store, () => storageReady), testKey, limiter }));
  const s = app.listen(0);
  return { s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
}

beforeEach(() => {
  store = new MemoryKeyStore();
  testKey.mockClear();
  const started = start(true, new PerUserRateLimiter(2, 60_000));
  server = started.s;
  base = started.url;
});

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (user: string | null, method: string, path: string, body?: unknown, root = base) =>
  fetch(`${root}/api/me${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

// @types/node's fetch Response#json() returns Promise<unknown>; the response
// bodies in these tests are plain JSON objects, so read them through a typed
// helper instead of sprinkling `as any` at each call site. (Typed via
// ReturnType<typeof fetch>, not `Response`, since that identifier is
// shadowed by express's Response import above.)
const json = async (res: Awaited<ReturnType<typeof fetch>>): Promise<any> => res.json();

describe('/api/me', () => {
  it("returns only the caller's own profile and role, no tenant id", async () => {
    const res = await call('a', 'GET', '');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ user: { email: 'a@example.com', name: 'User a', image: null }, workspace: { role: 'owner' } });
  });

  it('rejects signed-out callers', async () => {
    expect((await call(null, 'GET', '/credentials')).status).toBe(401);
  });

  it('saves, lists masked, and deletes a key', async () => {
    const put = await call('a', 'PUT', '/credentials/deepseek', { apiKey: 'sk-abcdefghijkl9876' });
    expect(put.status).toBe(200);
    expect((await json(put)).last4).toBe('••••9876');

    const list = await json(await call('a', 'GET', '/credentials'));
    expect(list.credentials).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('abcdefghijkl');

    expect((await call('a', 'DELETE', '/credentials/deepseek')).status).toBe(200);
    expect((await json(await call('a', 'GET', '/credentials'))).credentials).toEqual([]);
  });

  it("isolates users: B cannot see, test or delete A's key", async () => {
    await call('a', 'PUT', '/credentials/deepseek', { apiKey: 'sk-abcdefghijkl9876' });
    expect((await json(await call('b', 'GET', '/credentials'))).credentials).toEqual([]);
    expect((await call('b', 'POST', '/credentials/deepseek/test')).status).toBe(404);
    expect((await call('b', 'DELETE', '/credentials/deepseek')).status).toBe(404);
    expect((await json(await call('a', 'GET', '/credentials'))).credentials).toHaveLength(1);
  });

  it('400 for unknown platforms and bad shapes', async () => {
    const unknown = await call('a', 'PUT', '/credentials/substack', { apiKey: 'x' });
    expect(unknown.status).toBe(400);
    expect((await json(unknown)).allowedPlatforms).toEqual(['deepseek', 'assemblyai', 'devto', 'linkedin', 'twitter', 'trypost']);

    const bad = await call('a', 'PUT', '/credentials/linkedin', { apiKey: 'x' });
    expect(bad.status).toBe(400);
    expect((await json(bad)).allowedFields).toEqual(['accessToken']);
  });

  it('saves a TryPost token masked, isolated per tenant', async () => {
    const put = await call('a', 'PUT', '/credentials/trypost', { apiToken: 'tp_secret_token_1234' });
    expect(put.status).toBe(200);
    expect((await json(put)).last4).toBe('••••1234');
    expect(JSON.stringify(await json(await call('a', 'GET', '/credentials')))).not.toContain('tp_secret');
    expect((await json(await call('b', 'GET', '/credentials'))).credentials).toEqual([]);
    expect((await call('a', 'PUT', '/credentials/trypost', { token: 'x' })).status).toBe(400);
  });

  it('tests a saved key and rate limits per user', async () => {
    await call('a', 'PUT', '/credentials/deepseek', { apiKey: 'sk-abcdefghijkl9876' });
    const first = await call('a', 'POST', '/credentials/deepseek/test');
    expect(first.status).toBe(200);
    expect(await json(first)).toEqual(expect.objectContaining({ ok: true, message: 'DeepSeek accepted this key.' }));
    expect(testKey).toHaveBeenCalledWith('deepseek', { apiKey: 'sk-abcdefghijkl9876' });

    await call('a', 'POST', '/credentials/deepseek/test');
    expect((await call('a', 'POST', '/credentials/deepseek/test')).status).toBe(429);
  });

  it('503 KEY_STORAGE_UNCONFIGURED when storage is not configured', async () => {
    const { s, url } = start(false, new PerUserRateLimiter());
    const res = await call('a', 'GET', '/credentials', undefined, url);
    expect(res.status).toBe(503);
    expect((await json(res)).code).toBe('KEY_STORAGE_UNCONFIGURED');
    await new Promise<void>((r) => s.close(() => r()));
  });
});
