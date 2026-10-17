import { Request, Response } from 'express';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, JWTVerifyGetKey, KeyLike, errors } from 'jose';
import { createRequireUser, AuthedRequest } from '../middleware/requireUser';

const AUTH_BASE = 'https://ep-test.neonauth.example.neon.tech/neondb/auth';
const ISS = new URL(AUTH_BASE).origin;

let privateKey: KeyLike;
let getKey: JWTVerifyGetKey;
let otherPrivateKey: KeyLike;

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  getKey = createLocalJWKSet({ keys: [{ ...jwk, alg: 'EdDSA', kid: 'k1' }] });
  otherPrivateKey = (await generateKeyPair('EdDSA', { crv: 'Ed25519' })).privateKey;
});

async function token(opts: { key?: KeyLike; iss?: string; exp?: number | string } = {}) {
  return new SignJWT({ email: 'a@example.com', name: 'User A', image: null })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject('user-a')
    .setIssuer(opts.iss ?? ISS)
    .setAudience(ISS)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '15m')
    .sign(opts.key ?? privateKey);
}

function mockReqRes(authHeader?: string) {
  const req = { header: (n: string) => (n.toLowerCase() === 'authorization' ? authHeader : undefined) } as unknown as Request;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const next = jest.fn();
  return { req, res, next, status, json };
}

const workspaces = { ensureForUser: jest.fn(async (id: string) => ({ tenantId: `tenant-${id}`, role: 'owner' })) };

describe('requireUser', () => {
  it('attaches user and workspace for a valid token', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    const authed = req as AuthedRequest;
    expect(authed.user).toEqual({ userId: 'user-a', email: 'a@example.com', name: 'User A', image: null });
    expect(authed.workspace).toEqual({ tenantId: 'tenant-user-a', role: 'owner' });
  });

  it('401 SIGNED_OUT without a bearer token', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status, json } = mockReqRes();
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SIGNED_OUT' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('401 INVALID_TOKEN for a token signed by another key', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token({ key: otherPrivateKey })}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('401 INVALID_TOKEN for the wrong issuer', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token({ iss: 'https://evil.example' })}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('401 TOKEN_EXPIRED for an expired token', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token({ exp: Math.floor(Date.now() / 1000) - 60 })}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
  });

  it('401 INVALID_TOKEN when email is missing', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setSubject('user-a')
      .setIssuer(ISS)
      .setAudience(ISS)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);
    const { req, res, next, status, json } = mockReqRes(`Bearer ${noEmail}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('503 AUTH_UNCONFIGURED when NEON_AUTH_BASE_URL is unset', async () => {
    const mw = createRequireUser({ authBaseUrl: undefined, workspaces, getKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_UNCONFIGURED' }));
  });

  it('503 AUTH_UNAVAILABLE when the key set cannot be fetched', async () => {
    const failingGetKey = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as JWTVerifyGetKey;
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey: failingGetKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_UNAVAILABLE' }));
  });

  it('503 AUTH_UNAVAILABLE when the key set endpoint errors (bare JOSEError)', async () => {
    const failingGetKey = (async () => {
      throw new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response');
    }) as unknown as JWTVerifyGetKey;
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey: failingGetKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_UNAVAILABLE' }));
  });

  it('503 WORKSPACE_UNAVAILABLE when the workspace cannot be resolved', async () => {
    const broken = { ensureForUser: jest.fn().mockRejectedValue(new Error('db down')) };
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces: broken, getKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'WORKSPACE_UNAVAILABLE' }));
  });

  it('does not log the raw error message when workspace resolution fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sensitive = new Error('duplicate key value violates unique constraint "x" params=[user-a, ciphertext-abc]');
    const broken = { ensureForUser: jest.fn().mockRejectedValue(sensitive) };
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces: broken, getKey });
    const { req, res, next } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('ciphertext-abc');
    expect(logged).not.toContain('duplicate key value');
    spy.mockRestore();
  });

  it('503 AUTH_UNCONFIGURED when NEON_AUTH_BASE_URL is malformed', async () => {
    const mw = createRequireUser({ authBaseUrl: 'not a url', workspaces, getKey });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_UNCONFIGURED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('503 KEY_STORAGE_UNCONFIGURED when storageReady() returns false', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey, storageReady: () => false });
    const { req, res, next, status, json } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'KEY_STORAGE_UNCONFIGURED', error: 'Account storage is not configured on this server.' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through storageReady() when it returns true', async () => {
    const mw = createRequireUser({ authBaseUrl: AUTH_BASE, workspaces, getKey, storageReady: () => true });
    const { req, res, next, status } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
