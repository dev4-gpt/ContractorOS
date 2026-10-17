import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed call token.
 *
 * The browser talks to AssemblyAI directly with an ephemeral token, so the
 * server never sees call audio. What the server CAN do is decide, at mint time,
 * whose minutes a call spends and for how long, and sign that decision. The
 * client echoes the token back on telemetry ingest; because tenantId, iat and
 * maxSessionSeconds are inside the HMAC, a visitor cannot choose whose quota
 * they consume, and cannot claim more billable time than the token allowed.
 *
 * Format: base64url(JSON claims) + '.' + base64url(HMAC-SHA256). Secret comes
 * from CALL_TOKEN_SECRET, falling back to MASTER_KEY, mirroring cryptoService's
 * "fail loudly when unset" convention.
 */

export type CallSource = 'console' | 'console_anon' | 'widget' | 'widget_unattributed';

export interface CallTokenClaims {
  callId: string;
  tenantId: string;
  source: CallSource;
  /** Whether this call counts against tenantId's quota. */
  billable: boolean;
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expiry, epoch seconds. Covers the session cap plus a flush grace period. */
  exp: number;
  maxSessionSeconds: number;
}

/** Telemetry can arrive after the session ends (pagehide beacon); allow for it. */
export const CALL_TOKEN_GRACE_SECONDS = 15 * 60;

function getSecret(): string {
  const secret = process.env.CALL_TOKEN_SECRET || process.env.MASTER_KEY;
  if (!secret) {
    throw new Error('CALL_TOKEN_SECRET (or MASTER_KEY) is not set. Call tokens cannot be signed.');
  }
  return secret;
}

export function isCallTokenConfigured(): boolean {
  return Boolean(process.env.CALL_TOKEN_SECRET || process.env.MASTER_KEY);
}

const b64 = (buf: Buffer) => buf.toString('base64url');

function mac(body: string): Buffer {
  return createHmac('sha256', getSecret()).update(body).digest();
}

export interface SignCallTokenInput {
  callId: string;
  tenantId: string;
  source: CallSource;
  billable: boolean;
  maxSessionSeconds: number;
  /** Injected in tests. */
  nowMs?: number;
}

export function signCallToken(input: SignCallTokenInput): { token: string; claims: CallTokenClaims } {
  const iat = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const maxSessionSeconds = Math.max(0, Math.floor(input.maxSessionSeconds));
  const claims: CallTokenClaims = {
    callId: input.callId,
    tenantId: input.tenantId,
    source: input.source,
    billable: input.billable,
    iat,
    exp: iat + maxSessionSeconds + CALL_TOKEN_GRACE_SECONDS,
    maxSessionSeconds
  };
  const body = b64(Buffer.from(JSON.stringify(claims), 'utf8'));
  return { token: `${body}.${b64(mac(body))}`, claims };
}

export type VerifyResult =
  | { ok: true; claims: CallTokenClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyCallToken(token: unknown, nowMs: number = Date.now()): VerifyResult {
  if (typeof token !== 'string' || token.length > 2048) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;

  const expected = mac(body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims: CallTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    !claims ||
    typeof claims.callId !== 'string' ||
    typeof claims.tenantId !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number' ||
    typeof claims.maxSessionSeconds !== 'number' ||
    typeof claims.billable !== 'boolean'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.floor(nowMs / 1000) > claims.exp) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}
