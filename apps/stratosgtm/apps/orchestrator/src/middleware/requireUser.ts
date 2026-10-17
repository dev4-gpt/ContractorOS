import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, errors, JWTVerifyGetKey } from 'jose';
import type { Workspace } from '../services/workspaceService';

export interface AuthedUser {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface AuthedRequest extends Request {
  user: AuthedUser;
  workspace: Workspace;
}

export interface RequireUserDeps {
  authBaseUrl: string | undefined;
  workspaces: { ensureForUser(authUserId: string): Promise<Workspace> };
  /** Injected in tests; defaults to Neon Auth's remote JWKS. */
  getKey?: JWTVerifyGetKey;
  /**
   * Optional check for whether account storage (the database) is configured.
   * When provided and it returns false, requests fail fast with 503
   * `KEY_STORAGE_UNCONFIGURED` instead of reaching workspace resolution,
   * which would otherwise throw and surface as a misleading
   * `WORKSPACE_UNAVAILABLE` "temporarily unavailable" for what is really a
   * configuration gap, not an outage.
   */
  storageReady?: () => boolean;
}

function fail(res: Response, status: number, code: string, error: string) {
  return res.status(status).json({ error, code });
}

/**
 * True only for errors that mean the *token itself* is malformed, unsigned by a
 * trusted key, or fails claim validation — i.e. the caller's fault, not ours.
 * Everything else (bare JOSEError from a JWKS fetch failure, JWKSTimeout,
 * JWKSInvalid, plain network/TypeErrors) is an outage on our side and must map
 * to 503 AUTH_UNAVAILABLE, never 401.
 */
function isTokenError(err: unknown): boolean {
  return (
    err instanceof errors.JWSSignatureVerificationFailed ||
    err instanceof errors.JWSInvalid ||
    err instanceof errors.JWTInvalid ||
    err instanceof errors.JWTClaimValidationFailed ||
    err instanceof errors.JWKSNoMatchingKey ||
    err instanceof errors.JWKSMultipleMatchingKeys ||
    err instanceof errors.JOSEAlgNotAllowed ||
    err instanceof errors.JOSENotSupported
  );
}

/**
 * Verifies a Neon Auth (managed Better Auth) JWT and resolves the caller's private
 * workspace. The workspace comes only from the verified `sub` — never from the
 * request — so one user can never address another user's data.
 */
export function createRequireUser(deps: RequireUserDeps): RequestHandler {
  let remoteKeySet: JWTVerifyGetKey | null = null;

  // Parse the configured base URL once, at setup time, rather than inside the
  // async handler. `new URL()` throws on a malformed value; Express 4 does
  // not catch a throw from an async handler, so doing this per-request would
  // hang the request instead of failing. If the value is missing or
  // malformed, every request is answered with 503 AUTH_UNCONFIGURED.
  let base: string | null = null;
  let origin: string | null = null;
  if (deps.authBaseUrl) {
    try {
      const trimmed = deps.authBaseUrl.replace(/\/+$/, '');
      origin = new URL(trimmed).origin;
      base = trimmed;
    } catch {
      base = null;
      origin = null;
    }
  }

  return async function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!base || !origin) {
      return fail(res, 503, 'AUTH_UNCONFIGURED', 'Sign-in is not configured on this server.');
    }

    if (deps.storageReady && !deps.storageReady()) {
      return fail(
        res,
        503,
        'KEY_STORAGE_UNCONFIGURED',
        'Account storage is not configured on this server.'
      );
    }

    const header = req.header('authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return fail(res, 401, 'SIGNED_OUT', 'Sign in required.');
    }

    const getKey = deps.getKey ?? (remoteKeySet ??= createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)));

    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, getKey, { issuer: origin, audience: origin }));
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        return fail(res, 401, 'TOKEN_EXPIRED', 'Your session expired. Sign in again.');
      }
      if (isTokenError(err)) {
        return fail(res, 401, 'INVALID_TOKEN', 'Invalid session token.');
      }
      // Everything else — a bare JOSEError from a failed JWKS fetch, JWKSTimeout,
      // JWKSInvalid, or a plain network error — is our outage, not the user's
      // signed-out state.
      return fail(res, 503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    }

    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!userId || !email) {
      return fail(res, 401, 'INVALID_TOKEN', 'Invalid session token.');
    }

    let workspace: Workspace;
    try {
      workspace = await deps.workspaces.ensureForUser(userId);
    } catch (err: any) {
      // Log only a safe summary — never err.message. Drizzle's DrizzleQueryError
      // message includes query params (the Google user id; ciphertext/wrappedDek
      // on writes), which must never reach logs.
      console.error('[requireUser] Workspace resolution failed:', err?.name, err?.cause?.code ?? '');
      return fail(res, 503, 'WORKSPACE_UNAVAILABLE', 'Your workspace is temporarily unavailable.');
    }

    const authed = req as AuthedRequest;
    authed.user = {
      userId,
      email,
      name: typeof payload.name === 'string' ? payload.name : null,
      image: typeof payload.image === 'string' ? payload.image : null
    };
    authed.workspace = workspace;
    next();
  };
}
