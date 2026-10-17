import { signCallToken, verifyCallToken, CALL_TOKEN_GRACE_SECONDS } from '../services/callTokenService';

describe('callTokenService', () => {
  const OLD = process.env.CALL_TOKEN_SECRET;
  beforeAll(() => {
    process.env.CALL_TOKEN_SECRET = 'test-secret';
  });
  afterAll(() => {
    process.env.CALL_TOKEN_SECRET = OLD;
  });

  const base = { callId: 'c1', tenantId: 'tenant-a', source: 'console' as const, billable: true, maxSessionSeconds: 600 };

  it('round-trips claims', () => {
    const { token } = signCallToken({ ...base, nowMs: 1_700_000_000_000 });
    const r = verifyCallToken(token, 1_700_000_100_000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims).toMatchObject({ callId: 'c1', tenantId: 'tenant-a', iat: 1_700_000_000, maxSessionSeconds: 600 });
      expect(r.claims.exp).toBe(1_700_000_000 + 600 + CALL_TOKEN_GRACE_SECONDS);
    }
  });

  it('rejects a tampered tenantId', () => {
    const { token } = signCallToken(base);
    const [body, sig] = token.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    claims.tenantId = 'tenant-victim';
    const forged = `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${sig}`;
    expect(verifyCallToken(forged)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an expired token', () => {
    const { claims, token } = signCallToken({ ...base, nowMs: 1_700_000_000_000 });
    expect(verifyCallToken(token, (claims.exp + 1) * 1000)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects malformed input and a different secret', () => {
    expect(verifyCallToken('nope').ok).toBe(false);
    expect(verifyCallToken(undefined).ok).toBe(false);
    const { token } = signCallToken(base);
    process.env.CALL_TOKEN_SECRET = 'other';
    expect(verifyCallToken(token)).toEqual({ ok: false, reason: 'bad_signature' });
    process.env.CALL_TOKEN_SECRET = 'test-secret';
  });
});
