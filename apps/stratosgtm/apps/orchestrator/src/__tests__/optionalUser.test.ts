import { Request, Response } from 'express';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, JWTVerifyGetKey, KeyLike } from 'jose';
import { createOptionalUser, OptionalAuthedRequest } from '../middleware/optionalUser';

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

describe('optionalUser', () => {
  it('attaches user and workspace for a valid token', async () => {
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    const authed = req as OptionalAuthedRequest;
    expect(authed.user).toEqual({ userId: 'user-a', email: 'a@example.com', name: 'User A', image: null });
    expect(authed.workspace).toEqual({ tenantId: 'tenant-user-a', role: 'owner' });
  });

  it('proceeds with no user when there is no bearer token', async () => {
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status } = mockReqRes();
    await mw(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect((req as OptionalAuthedRequest).user).toBeUndefined();
  });

  it('proceeds with no user for a token signed by another key', async () => {
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status } = mockReqRes(`Bearer ${await token({ key: otherPrivateKey })}`);
    await mw(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect((req as OptionalAuthedRequest).user).toBeUndefined();
  });

  it('proceeds with no user for an expired token', async () => {
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next } = mockReqRes(`Bearer ${await token({ exp: Math.floor(Date.now() / 1000) - 60 })}`);
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as OptionalAuthedRequest).user).toBeUndefined();
  });

  it('proceeds with no user when auth is unconfigured', async () => {
    const mw = createOptionalUser({ authBaseUrl: undefined, workspaces, getKey });
    const { req, res, next } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as OptionalAuthedRequest).user).toBeUndefined();
  });

  it('proceeds with no user when the key set cannot be fetched', async () => {
    const failingGetKey = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as JWTVerifyGetKey;
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces, getKey: failingGetKey });
    const { req, res, next } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as OptionalAuthedRequest).user).toBeUndefined();
  });

  it('proceeds with no user when workspace resolution fails', async () => {
    const broken = { ensureForUser: jest.fn().mockRejectedValue(new Error('db down')) };
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces: broken, getKey });
    const { req, res, next } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as OptionalAuthedRequest).user).toBeUndefined();
  });

  it('proceeds with no user when storageReady() returns false', async () => {
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces, getKey, storageReady: () => false });
    const { req, res, next } = mockReqRes(`Bearer ${await token()}`);
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect((req as OptionalAuthedRequest).user).toBeUndefined();
  });

  it('never calls res.status, regardless of outcome', async () => {
    const mw = createOptionalUser({ authBaseUrl: AUTH_BASE, workspaces, getKey });
    const { req, res, next, status } = mockReqRes('Bearer not-a-jwt');
    await mw(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
